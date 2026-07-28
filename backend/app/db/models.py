from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChampionLaneStat(Base):
    """Participant-level aggregate: games/wins/KDA for a champion in a lane, per tier and patch."""

    __tablename__ = "champion_lane_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]
    games: Mapped[int] = mapped_column(default=0)
    wins: Mapped[int] = mapped_column(default=0)
    kills: Mapped[int] = mapped_column(default=0)
    deaths: Mapped[int] = mapped_column(default=0)
    assists: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionBanStat(Base):
    """Ban counts are match-wide (not lane-specific), tracked separately from lane stats."""

    __tablename__ = "champion_ban_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    champion_id: Mapped[str]
    bans: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier", "champion_id"),)


class SegmentTotal(Base):
    """Denominator for pick rate / ban rate: unique matches processed per tier+patch."""

    __tablename__ = "segment_totals"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    total_matches: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier"),)
