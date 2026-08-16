from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import PlayerRoadmapStep


class PlayerRoadmapRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all_for_player(
        self, game_name_key: str, tag_line_key: str, region: str
    ) -> list[PlayerRoadmapStep]:
        return (
            self.db.query(PlayerRoadmapStep)
            .filter_by(
                game_name_key=game_name_key, tag_line_key=tag_line_key, region=region
            )
            .all()
        )

    def get_least_bad_active(
        self, game_name_key: str, tag_line_key: str, region: str
    ) -> PlayerRoadmapStep | None:
        """ "Menos ruim" = maior `delta_pct_atual` entre os ativos (mais
        perto de zero, ou já acima) — é esse que sai quando o teto de
        passos ativos está cheio e um gap pior aparece."""
        return (
            self.db.query(PlayerRoadmapStep)
            .filter_by(
                game_name_key=game_name_key,
                tag_line_key=tag_line_key,
                region=region,
                status="active",
            )
            .order_by(PlayerRoadmapStep.delta_pct_atual.desc())
            .first()
        )

    def create_or_reactivate(
        self,
        game_name_key: str,
        tag_line_key: str,
        region: str,
        existing: PlayerRoadmapStep | None,
        champion_id: str,
        lane: str,
        delta_pct: float,
        partidas: int,
        roadmap_token: str,
    ) -> PlayerRoadmapStep:
        if existing is not None:
            existing.status = "active"
            existing.delta_pct_inicial = delta_pct
            existing.delta_pct_atual = delta_pct
            existing.partidas_base = partidas
            existing.partidas_atual = partidas
            existing.completed_at = None
            existing.roadmap_token = roadmap_token
            self.db.add(existing)
            return existing

        step = PlayerRoadmapStep(
            game_name_key=game_name_key,
            tag_line_key=tag_line_key,
            region=region,
            champion_id=champion_id,
            lane=lane,
            status="active",
            delta_pct_inicial=delta_pct,
            delta_pct_atual=delta_pct,
            partidas_base=partidas,
            partidas_atual=partidas,
            roadmap_token=roadmap_token,
        )
        self.db.add(step)
        return step

    def update_progress(
        self, step: PlayerRoadmapStep, delta_pct_atual: float, partidas_atual: int
    ) -> None:
        step.delta_pct_atual = delta_pct_atual
        step.partidas_atual = partidas_atual
        self.db.add(step)

    def mark_completed(self, step: PlayerRoadmapStep) -> None:
        step.status = "completed"
        step.completed_at = datetime.now(timezone.utc)
        self.db.add(step)

    def mark_replaced(self, step: PlayerRoadmapStep) -> None:
        step.status = "replaced"
        self.db.add(step)

    def delete_all_for_player(
        self,
        game_name_key: str,
        tag_line_key: str,
        region: str,
        roadmap_token: str,
    ) -> int:
        """Auditoria 16/08 (achado verificado direto no código, reaberto
        com severidade maior de 09/08): `roadmap_token` era opcional e,
        omitido, apagava sem checar — Riot ID é público, então qualquer
        um apagava o roadmap de qualquer jogador só sabendo o nome#tag.
        Agora é obrigatório e sempre filtra — token errado (ou de um
        jogador que nunca teve roadmap) apaga 0 linhas em vez de levantar
        erro, mesmo espírito de "não é autenticação de verdade" já
        documentado no modelo, mas sem o desvio que permitia apagar sem
        token nenhum."""
        return (
            self.db.query(PlayerRoadmapStep)
            .filter_by(
                game_name_key=game_name_key,
                tag_line_key=tag_line_key,
                region=region,
                roadmap_token=roadmap_token,
            )
            .delete()
        )
