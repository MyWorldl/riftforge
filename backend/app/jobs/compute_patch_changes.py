"""Item novo: "o que a Riot mudou de verdade" no patch. Fonte PRIMÁRIA
(pedido do usuário) é a nota oficial da Riot (leagueoflegends.com,
`app/adapters/riot_patch_notes.py`) — texto humano com valor de antes/
depois real, sem os dois problemas achados no diff bruto do Data Dragon
(`app/core/patch_notes_diff.py`): mudanças falsas quando uma habilidade
migra pro sistema de variáveis nomeadas (valor zera/reescala sem
relação com o jogo) e campeões inteiros perdidos (kit já migrado, sem
nenhum valor confiável pra comparar — ex: Locke).

Fallback pro diff antigo do Data Dragon só se a busca/parse da nota
oficial falhar de verdade (rede, patch não encontrado no índice, Riot
redesenhou o template) — não é escolha de qual é "melhor" a cada vez,
nota oficial sempre vence quando disponível.

Roda como job batch (mesmo padrão do resto do pipeline, ver
`compute_kit.py`) em vez de calcular ao vivo na API.

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
from app.adapters.riot_patch_notes import RiotPatchNotesAdapter
from app.core.logging import get_logger, new_correlation_id
from app.core.patch_notes_diff import diff_champion_detail
from app.core.patch_notes_translation import translate_spell_names
from app.core.riot_patch_notes_parser import normalize_slug, parse_champions_section
from app.db.models import ChampionPatchChange
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)

CONCURRENCY = 10
SPELL_SLOTS = ["Q", "W", "E", "R"]


async def _resolve_versions(
    data_dragon: DataDragonAdapter, patch_prefix: str | None
) -> tuple[str, str | None]:
    versions = await data_dragon.get_versions()
    if patch_prefix:
        index = next(
            (i for i, v in enumerate(versions) if v.startswith(patch_prefix)), 0
        )
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
                return champion_id, await data_dragon.get_champion_detail(
                    version, champion_id
                )
            except httpx.HTTPStatusError as exc:
                log.warning(
                    "champion_detail_indisponivel",
                    champion_id=champion_id,
                    data_dragon_version=version,
                    status_code=exc.response.status_code,
                )
                return champion_id, None

    results = await asyncio.gather(*(fetch_one(cid) for cid in champion_ids))
    return {
        champion_id: detail for champion_id, detail in results if detail is not None
    }


async def _fetch_champion_spells_ptbr(
    data_dragon: DataDragonAdapter, version: str, champion_ids: set[str]
) -> dict[str, dict[str, str]]:
    """Nome de habilidade em pt_BR (tradução oficial da Riot, pedido do
    usuário) + em en_US (só pra comparar e confirmar que bate com o que
    a nota oficial escreveu antes de trocar — ver `translate_spell_names`).
    Só pros campeões que tiveram mudança real nesse patch (poucos), não
    os ~170 inteiros — 2 fetches a mais por campeão (en_US já usado em
    outro lugar do job não cobre isso, é o resumo `champion.json`, sem
    nome de spell)."""
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def fetch_one(champion_id: str) -> tuple[str, dict[str, str]]:
        async with semaphore:
            try:
                detail_en = await data_dragon.get_champion_detail(
                    version, champion_id, locale="en_US"
                )
                detail_pt = await data_dragon.get_champion_detail(
                    version, champion_id, locale="pt_BR"
                )
            except httpx.HTTPStatusError as exc:
                log.warning(
                    "nomes_ptbr_indisponiveis",
                    champion_id=champion_id,
                    status_code=exc.response.status_code,
                )
                return champion_id, {}

        names_en = {
            slot: spell["name"] for slot, spell in zip(SPELL_SLOTS, detail_en["spells"])
        }
        names_en["passive"] = detail_en["passive"]["name"]
        names_pt = {
            slot: spell["name"] for slot, spell in zip(SPELL_SLOTS, detail_pt["spells"])
        }
        names_pt["passive"] = detail_pt["passive"]["name"]
        names_pt["_en"] = names_en
        return champion_id, names_pt

    results = await asyncio.gather(*(fetch_one(cid) for cid in champion_ids))
    return {champion_id: names for champion_id, names in results if names}


async def _changes_from_official_notes(
    riot_patch_notes: RiotPatchNotesAdapter,
    champions_meta: dict,
    version: str,
) -> list[dict] | None:
    """`None` quando a busca/parse falha de verdade (rede, patch não
    encontrado no índice, Riot mudou o template) — o chamador cai pro
    diff antigo do Data Dragon nesse caso. Lista vazia é resultado
    válido (patch sem mudança de campeão nenhuma), não é o mesmo que
    `None`."""
    try:
        patch_notes_url = await riot_patch_notes.find_patch_notes_url(version)
        if patch_notes_url is None:
            log.warning(
                "nota_oficial_nao_encontrada_no_indice", data_dragon_version=version
            )
            return None
        html = await riot_patch_notes.get_champions_section_html(patch_notes_url)
    except Exception:
        log.exception("falha_ao_buscar_nota_oficial", data_dragon_version=version)
        return None

    slug_to_champion_id = {
        normalize_slug(meta["name"]): champion_id
        for champion_id, meta in champions_meta.items()
        if not champion_id.startswith("Jade_")
    }
    return parse_champions_section(html, slug_to_champion_id)


def compute(patch_prefix: str | None = None) -> dict:
    new_correlation_id()
    init_db()
    data_dragon = DataDragonAdapter()
    riot_patch_notes = RiotPatchNotesAdapter()

    version, previous_version = asyncio.run(
        _resolve_versions(data_dragon, patch_prefix)
    )
    if previous_version is None:
        return {
            "patch": ".".join(version.split(".")[:2]),
            "patch_anterior": None,
            "mudancas": 0,
            "campeoes_afetados": 0,
        }

    version_label = ".".join(version.split(".")[:2])
    previous_label = ".".join(previous_version.split(".")[:2])

    champions = asyncio.run(data_dragon.get_champions(version))
    champion_ids = list(champions.keys())

    # Fonte primária: nota oficial (pedido do usuário) — só cai pro diff
    # bruto do Data Dragon se a busca/parse falhar de verdade (ver
    # docstring de `_changes_from_official_notes`).
    official_changes = asyncio.run(
        _changes_from_official_notes(riot_patch_notes, champions, version_label)
    )

    changes_by_champion: dict[str, list[dict]] = {}
    fonte = "nota_oficial"
    if official_changes is not None:
        # Pedido do usuário: traduzir nome de habilidade (via Data Dragon
        # pt_BR, só pros campeões que mudaram nesse patch) e rótulo de
        # atributo/efeito (dicionário próprio) — ver
        # `app/core/patch_notes_translation.py`.
        affected_champion_ids = {c["champion_id"] for c in official_changes}
        spells_ptbr = asyncio.run(
            _fetch_champion_spells_ptbr(data_dragon, version, affected_champion_ids)
        )
        official_changes = translate_spell_names(official_changes, spells_ptbr)
        for change in official_changes:
            changes_by_champion.setdefault(change["champion_id"], []).append(change)
    else:
        fonte = "diff_data_dragon_fallback"
        log.warning("usando_fallback_diff_data_dragon", data_dragon_version=version)
        log.info(
            "buscando_detalhe_campeoes",
            total=len(champion_ids),
            versao_anterior=previous_version,
            versao_atual=version,
        )
        details_before = asyncio.run(
            _fetch_all_details(data_dragon, previous_version, champion_ids)
        )
        details_after = asyncio.run(
            _fetch_all_details(data_dragon, version, champion_ids)
        )
        for champion_id in champion_ids:
            before = details_before.get(champion_id)
            after = details_after.get(champion_id)
            if before is None or after is None:
                continue
            changes = diff_champion_detail(champion_id, before, after)
            if changes:
                changes_by_champion[champion_id] = changes

    session = SessionLocal()
    try:
        session.query(ChampionPatchChange).filter_by(patch=version_label).delete()

        total_changes = 0
        for changes in changes_by_champion.values():
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
        "campeoes_afetados": len(changes_by_champion),
        "fonte": fonte,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detecta mudanças reais de patch comparando o Data Dragon de duas versões."
    )
    parser.add_argument(
        "--patch",
        default=None,
        help="Prefixo de patch (ex: 16.15). Padrão: mais recente.",
    )
    args = parser.parse_args()

    result = compute(patch_prefix=args.patch)
    if result["patch_anterior"] is None:
        log.info("sem_patch_anterior", patch=result["patch"])
        return
    log.info("job_concluido", job="compute_patch_changes", **result)


if __name__ == "__main__":
    main()
