"""add_region_to_champion_tables

Revision ID: 83b9214bdd2b
Revises: 90c1198503b3
Create Date: 2026-08-08 18:59:54.800847

Lote N do plano de filtro de região (piloto br1+euw1). Adiciona `region`
(NOT NULL, default 'br1' — o backfill correto pra todo dado existente,
já que o pipeline sempre foi implicitamente br1) nas 12 tabelas do
pipeline de score, e troca cada `UniqueConstraint` de negócio pra
incluir `region` no fim da tupla.

Nomes de constraint antigos confirmados por consulta direta contra
`information_schema` no Supabase de produção — o Postgres autogera e
trunca em 63 bytes, então `champion_matchups` (5 colunas) diverge do
nome "óbvio" (`..._opponent_champion_id_key`, na real
`..._opponent_cham_key`). Usar qualquer coisa diferente do nome exato
abaixo faria o DROP falhar.

`models.py` não muda nesta revisão de propósito — isso é o Lote O,
separado. Enquanto isso, `server_default='br1'` cobre qualquer INSERT
feito pelo código ainda não-region-aware.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83b9214bdd2b'
down_revision: Union[str, Sequence[str], None] = '90c1198503b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, nome da constraint antiga, colunas de negócio sem region)
TABLES: list[tuple[str, str, tuple[str, ...]]] = [
    ("champion_lane_stats", "champion_lane_stats_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_ban_stats", "champion_ban_stats_patch_tier_champion_id_key",
     ("patch", "tier", "champion_id")),
    ("segment_totals", "segment_totals_patch_tier_key",
     ("patch", "tier")),
    ("baselines", "baselines_patch_tier_lane_key",
     ("patch", "tier", "lane")),
    ("champion_performance_scores", "champion_performance_scores_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_build_patch", "champion_build_patch_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_build_scores", "champion_build_scores_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_meta_context", "champion_meta_context_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_scores", "champion_scores_patch_elo_tier_lane_champion_id_key",
     ("patch", "elo_tier", "lane", "champion_id")),
    ("champion_matchups", "champion_matchups_patch_tier_lane_champion_id_opponent_cham_key",
     ("patch", "tier", "lane", "champion_id", "opponent_champion_id")),
    ("champion_build_recommendations", "champion_build_recommendations_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
    ("champion_skill_expression", "champion_skill_expression_patch_tier_lane_champion_id_key",
     ("patch", "tier", "lane", "champion_id")),
]


def upgrade() -> None:
    for table, old_constraint, columns in TABLES:
        new_constraint = f"uq_{table}"
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(
                sa.Column("region", sa.String(), nullable=False, server_default="br1")
            )
            batch_op.drop_constraint(old_constraint, type_="unique")
            batch_op.create_unique_constraint(new_constraint, [*columns, "region"])


def downgrade() -> None:
    for table, old_constraint, columns in reversed(TABLES):
        new_constraint = f"uq_{table}"
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_constraint(new_constraint, type_="unique")
            batch_op.create_unique_constraint(old_constraint, list(columns))
            batch_op.drop_column("region")
