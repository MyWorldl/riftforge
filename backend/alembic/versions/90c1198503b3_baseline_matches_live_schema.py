"""baseline_matches_live_schema

Revision ID: 90c1198503b3
Revises:
Create Date: 2026-08-08 18:54:51.035861

Revisão vazia de propósito — marca o ponto em que `models.py` foi
confirmado idêntico ao schema real do Supabase (depois de corrigir o
drift de tipo cosmético em `ChampionLaneStat`/`ChampionBanStat`/
`SegmentTotal`, ver models.py). Aplicada via `alembic stamp head` contra
produção, nunca `upgrade` de verdade — o banco já está neste estado.
"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = '90c1198503b3'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
