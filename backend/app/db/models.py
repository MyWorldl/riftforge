from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Patch(Base):
    """Reference row per patch. Patch version strings don't sort correctly
    lexicographically ("16.9" > "16.14" alphabetically) — patch_sequence is
    the source of truth for chronological order (Core §15_SCHEMA_DADOS.md §3)."""

    __tablename__ = "patches"

    id: Mapped[int] = mapped_column(primary_key=True)
    version_label: Mapped[str] = mapped_column(unique=True)
    patch_sequence: Mapped[int] = mapped_column(unique=True)


class Match(Base):
    """Raw match record, persisted so re-running ingestion never re-counts a
    match already processed (Core §11_PIPELINE_INGESTAO.md §4)."""

    __tablename__ = "matches"

    match_id: Mapped[str] = mapped_column(primary_key=True)
    patch_id: Mapped[int] = mapped_column(ForeignKey("patches.id"))
    platform_region: Mapped[str]
    queue_id: Mapped[int]
    game_start_ts: Mapped[int] = mapped_column(BigInteger)
    game_duration_s: Mapped[int]
    ingested_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    raw_payload: Mapped[dict] = mapped_column(JSON)


class MatchParticipant(Base):
    """One row per player per match. `riot_champion_id` (numeric) is the
    stable key — Match-V5's `championName` string sometimes diverges from
    Data Dragon's `id` (e.g. "Kai'Sa" vs "Kaisa"), so it's kept only for
    debugging, never as a lookup key (Core §05_BOAS_PRATICAS_CODIGO.md §3)."""

    __tablename__ = "match_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    puuid: Mapped[str]
    riot_champion_id: Mapped[int]
    champion_name: Mapped[str]
    team_id: Mapped[int]
    win: Mapped[bool]
    raw_role: Mapped[str | None]
    raw_lane: Mapped[str | None]
    resolved_position: Mapped[str | None]
    resolution_method: Mapped[str | None]
    kills: Mapped[int]
    deaths: Mapped[int]
    assists: Mapped[int]
    core_items: Mapped[list] = mapped_column(JSON)
    elo_tier: Mapped[str]

    __table_args__ = (UniqueConstraint("match_id", "puuid"),)


class MatchBan(Base):
    """Bans are match-wide, not tied to a participant row."""

    __tablename__ = "match_bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    riot_champion_id: Mapped[int]
    team_id: Mapped[int]
    ban_order: Mapped[int]


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
