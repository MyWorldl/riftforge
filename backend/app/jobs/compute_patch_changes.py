"""Item novo: "o que a Riot mudou de verdade" no patch, buscando o
detalhe de cada campeão em duas versões consecutivas do Data Dragon e
fazendo diff campo-a-campo (`app/core/patch_notes_diff.py`). Complementa
`compute_scores.py`/`patch_diff.py`, que mede IMPACTO estatístico via
partidas — este job mede a MUDANÇA NUMÉRICA em si, direto da fonte.

Roda como job batch (mesmo padrão do resto do pipeline, ver
`compute_kit.py`) em vez de calcular ao vivo na API: comparar ~170
campeões x 2 versões seria lento demais pra uma requisição HTTP, e o
Data Dragon não muda depois que o patch é publicado, então não há
motivo pra recalcular a cada request.

`versions.json` já vem em ordem cronológica decrescente (confirmado:
["16.15.1", "16.14.1", ...]) — a versão anterior é simplesmente a
próxima da lista, sem precisar de aritmética de major.minor (que
quebraria em virada de temporada, ex: 16.0 depois de 15.24).

Uso: python -m app.jobs.compute_patch_changes [--patch 16.15]
"""

import argparse
import asyncio

import httpx

from app.adapters.data_dragon import DataDragonAdapter
from app.core.patch_notes_diff import diff_champion_detail
from app.db.models import ChampionPatchChange
from app.db.session import SessionLocal, init_db

CONCURRENCY = 10


async def _resolve_versions(data_dragon: DataDragonAdapter, patch_prefix: str | None) -> tuple[str, str | None]:
    versions = await data_dragon.get_versions()
    if patch_prefix:
        index = next((i for i, v in enumerate(versions) if v.startswith(patch_prefix)), 0)
    else:
        index = 0
    current = versions[index]
    previous = versions[index + 1] if index + 1 < len(versions) else None
    return current, previous


async def _fetch_all_details(
    data_dragon: DataDragonAdapter, version: str, champion_ids: list[str]
) -> dict[str, dict]:
    """Achado ao rodar contra dado real: o resumo `champion.json` do patch
    16.15 inclui ~60 IDs tipo "Jade_Ahri" (variante de skin/universo
    alternativo) que não têm `champion/{id}.json` próprio — 403 ao buscar
    individualmente. Não é um erro transitório de rede (que já tem retry
    em `_get_json`), é uma inconsistência real do próprio Data Dragon, então
    pula esse campeão específico com aviso em vez de derrubar o lote
    inteiro via asyncio.gather."""
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def fetch_one(champion_id: str) -> tuple[str, dict | None]:
        async with semaphore:
            try:
                return champion_id, await data_dragon.get_champion_detail(version, champion_id)
            except httpx.HTTPStatusError as exc:
                print(f"  aviso: {champion_id} ({version}) — {exc.response.status_code}, pulando", flush=True)
                return champion_id, None

    results = await asyncio.gather(*(fetch_one(cid) for cid in champion_ids))
    return {champion_id: detail for champion_id, detail in results if detail is not None}


def compute(patch_prefix: str | None = None) -> dict:
    init_db()
    data_dragon = DataDragonAdapter()

    version, previous_version = asyncio.run(_resolve_versions(data_dragon, patch_prefix))
    if previous_version is None:
        return {"patch": ".".join(version.split(".")[:2]), "patch_anterior": None, "mudancas": 0, "campeoes_afetados": 0}

    version_label = ".".join(version.split(".")[:2])
    previous_label = ".".join(previous_version.split(".")[:2])

    champions = asyncio.run(data_dragon.get_champions(version))
    champion_ids = list(champions.keys())

    print(f"Buscando detalhe de {len(champion_ids)} campeões em {previous_version} e {version}...", flush=True)
    details_before = asyncio.run(_fetch_all_details(data_dragon, previous_version, champion_ids))
    details_after = asyncio.run(_fetch_all_details(data_dragon, version, champion_ids))

    session = SessionLocal()
    try:
        session.query(ChampionPatchChange).filter_by(patch=version_label).delete()

        total_changes = 0
        champions_affected = 0
        for champion_id in champion_ids:
            before = details_before.get(champion_id)
            after = details_after.get(champion_id)
            if before is None or after is None:
                continue

            changes = diff_champion_detail(champion_id, before, after)
            if not changes:
                continue

            champions_affected += 1
            for change in changes:
                session.add(
                    ChampionPatchChange(
                        patch=version_label,
                        patch_anterior=previous_label,
                        **change,
                    )
                )
                total_changes += 1

        session.commit()
    finally:
        session.close()

    return {
        "patch": version_label,
        "patch_anterior": previous_label,
        "mudancas": total_changes,
        "campeoes_afetados": champions_affected,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detecta mudanças reais de patch comparando o Data Dragon de duas versões."
    )
    parser.add_argument("--patch", default=None, help="Prefixo de patch (ex: 16.15). Padrão: mais recente.")
    args = parser.parse_args()

    result = compute(patch_prefix=args.patch)
    if result["patch_anterior"] is None:
        print(f"Sem patch anterior pra comparar com {result['patch']} (é o mais antigo na lista de versões).")
        return
    print(
        f"Patch changes calculado: {result['mudancas']} mudanças em {result['campeoes_afetados']} campeões "
        f"({result['patch_anterior']} -> {result['patch']})."
    )


if __name__ == "__main__":
    main()
