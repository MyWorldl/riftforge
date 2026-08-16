import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import PlayerRoadmapStep
from app.repositories.player_roadmap_repository import PlayerRoadmapRepository


def normalize_region(region: str | None) -> str:
    """Mesma normalização usada pra comparar o jogador contra
    `ChampionScore`/`Baseline` em `player_service.lookup_player` —
    extraída aqui pra `resolve_identity` e o endpoint de exclusão nunca
    divergirem sobre o que é "a mesma região"."""
    return (region or "br1").lower()


@dataclass(frozen=True)
class PlayerIdentity:
    game_name_key: str
    tag_line_key: str
    region: str


def resolve_identity(
    game_name: str, tag_line: str, region: str | None
) -> PlayerIdentity:
    """Chave de consulta do roadmap, não de autenticação — Riot ID
    digitado pelo próprio jogador, sem verificação de posse (decisão
    consciente, ver emenda ao doc de privacidade §4). Normalizado
    (lowercase+strip) pra "Fulano#BR1" e "fulano#br1" apontarem pro
    mesmo roadmap."""
    return PlayerIdentity(
        game_name_key=game_name.strip().lower(),
        tag_line_key=tag_line.strip().lower(),
        region=normalize_region(region),
    )


def _serialize(step: PlayerRoadmapStep) -> dict:
    return {
        "champion_id": step.champion_id,
        "lane": step.lane,
        "status": step.status,
        "delta_pct_inicial": step.delta_pct_inicial,
        "delta_pct_atual": step.delta_pct_atual,
        "partidas_base": step.partidas_base,
        "partidas_atual": step.partidas_atual,
        "created_at": step.created_at,
        "updated_at": step.updated_at,
        "completed_at": step.completed_at,
    }


def sync_roadmap_steps(
    db: Session,
    identity: PlayerIdentity,
    campeoes: list[dict],
    settings: Settings | None = None,
) -> dict:
    """Roadmap de Progressão do Jogador (rodada 28) — efeito colateral de
    escrita de `player_service.lookup_player()`. Recebe `campeoes` já
    pronto (mesma lista que a resposta do lookup usa), zero chamada Riot
    própria — por isso é testável isoladamente sem mockar Riot/Data
    Dragon.

    Um passo novo só nasce quando o gap (`delta_pct`) é pior que
    `roadmap_gap_threshold_pct` E a amostra (`partidas`) atinge
    `roadmap_min_matches` — mesmo piso de confiança usado em
    `matchup_min_games`/`build_recommendation_min_games`. Um passo ativo
    completa quando `delta_pct_atual` cruza `roadmap_completion_threshold_pct`
    (zero — alcançou a média do elo) e nunca reabre depois. Com o teto de
    `roadmap_max_active_steps` cheio, um gap novo pior que o menos ruim
    dos ativos substitui esse (que vira "replaced", não é apagado — pode
    reativar se voltar a ser o pior gap).

    Revisão técnica §4.2 (Sprint A item 1): `settings` opcional — omitido,
    cai no singleton `@lru_cache` de sempre (compatível com todo chamador
    existente, incluindo os testes que já chamam esta função sem esse
    argumento). Passado explicitamente pelo router via `Depends(get_settings)`
    (através de `player_service.lookup_player`), o override de settings em
    teste (`app.dependency_overrides`) passa a alcançar esta função — antes
    não alcançava, porque `get_settings()` chamado direto aqui ignora
    qualquer override da árvore de dependências do FastAPI."""
    settings = settings or get_settings()
    repo = PlayerRoadmapRepository(db)

    existing_rows = repo.get_all_for_player(
        identity.game_name_key, identity.tag_line_key, identity.region
    )
    existing = {(s.champion_id, s.lane): s for s in existing_rows}
    active_count = sum(1 for s in existing_rows if s.status == "active")
    # Revisão técnica 09/08 §2.3: token opaco, igual em toda linha da
    # identidade — reaproveita o de uma linha já existente, ou gera um
    # novo na primeira vez que esta identidade ganha um passo.
    roadmap_token = (
        existing_rows[0].roadmap_token if existing_rows else uuid.uuid4().hex
    )

    for c in campeoes:
        partidas = c["partidas"]
        comparativo = c["comparativo_baseline"]
        if partidas < settings.roadmap_min_matches or comparativo is None:
            continue  # amostra fraca ou sem baseline pra comparar — não mexe

        delta = comparativo["delta_pct"]
        key = (c["champion_id"], c["lane"])
        step = existing.get(key)

        if step is not None and step.status == "completed":
            continue  # terminal, nunca reaberto

        if step is not None and step.status == "active":
            repo.update_progress(step, delta, partidas)
            if delta >= settings.roadmap_completion_threshold_pct:
                repo.mark_completed(step)
            continue

        # step é None (nunca existiu) ou "replaced" (pode reativar)
        if delta > settings.roadmap_gap_threshold_pct:
            continue  # gap não é ruim o bastante pra virar passo

        if active_count < settings.roadmap_max_active_steps:
            new_step = repo.create_or_reactivate(
                identity.game_name_key,
                identity.tag_line_key,
                identity.region,
                step,
                c["champion_id"],
                c["lane"],
                delta,
                partidas,
                roadmap_token,
            )
            existing[key] = new_step
            active_count += 1
        else:
            least_bad = repo.get_least_bad_active(
                identity.game_name_key, identity.tag_line_key, identity.region
            )
            if least_bad is not None and delta < least_bad.delta_pct_atual:
                repo.mark_replaced(least_bad)
                new_step = repo.create_or_reactivate(
                    identity.game_name_key,
                    identity.tag_line_key,
                    identity.region,
                    step,
                    c["champion_id"],
                    c["lane"],
                    delta,
                    partidas,
                    roadmap_token,
                )
                existing[key] = new_step
                # active_count não muda: um saiu (replaced), um entrou (active)
            # senão: teto cheio, esse gap não é pior que o pior já ativo — ignora

    db.commit()

    final_rows = repo.get_all_for_player(
        identity.game_name_key, identity.tag_line_key, identity.region
    )
    ativos = sorted(
        (s for s in final_rows if s.status == "active"),
        key=lambda s: s.delta_pct_atual,
    )
    concluidos = sorted(
        (s for s in final_rows if s.status == "completed"),
        key=lambda s: s.completed_at or s.updated_at,
        reverse=True,
    )
    return {
        "ativos": [_serialize(s) for s in ativos],
        "concluidos": [_serialize(s) for s in concluidos],
        "roadmap_token": (
            ativos[0].roadmap_token if ativos else concluidos[0].roadmap_token
        )
        if (ativos or concluidos)
        else None,
    }


def delete_roadmap(
    db: Session, game_name: str, tag_line: str, region: str | None, roadmap_token: str
) -> int:
    """`DELETE /player/roadmap` — mecanismo de exclusão manual obrigatório
    (retenção sem prazo fixo, ver emenda ao doc de privacidade §7).

    Auditoria 16/08: `roadmap_token` era opcional aqui — omitido, o
    repository apagava sem checar. Como Riot ID é público, isso permitia
    qualquer um apagar o roadmap de qualquer jogador. Agora é obrigatório;
    o router (`app/api/routers/player.py`) já rejeita a requisição com
    422 antes de chegar aqui se `roadmap_token` não vier na query string
    — este parâmetro sem valor padrão é a segunda camada da mesma defesa,
    não só o router."""
    identity = resolve_identity(game_name, tag_line, region)
    repo = PlayerRoadmapRepository(db)
    deleted = repo.delete_all_for_player(
        identity.game_name_key, identity.tag_line_key, identity.region, roadmap_token
    )
    db.commit()
    return deleted
