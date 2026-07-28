from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from riotwatcher import ApiError

from app.adapters.data_dragon import DataDragonAdapter
from app.adapters.riot_api import RiotApiAdapter
from app.core.config import get_settings
from app.db.models import ChampionBanStat, ChampionLaneStat, SegmentTotal
from app.db.session import SessionLocal

settings = get_settings()

app = FastAPI(title="RiftForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

data_dragon = DataDragonAdapter()
riot_api = RiotApiAdapter()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


@app.get("/champions")
async def list_champions() -> dict:
    version = await data_dragon.get_latest_version()
    champions = await data_dragon.get_champions(version)
    return {"patch": version, "champions": champions}


@app.get("/riot/league-entries")
def get_league_entries(
    queue: str = "RANKED_SOLO_5x5", tier: str = "GOLD", division: str = "I"
) -> list[dict]:
    try:
        return riot_api.get_league_entries(queue, tier, division)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc


@app.get("/riot/matches/{match_id}")
def get_match(match_id: str) -> dict:
    try:
        return riot_api.get_match(match_id)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc


@app.get("/stats/champions")
def get_champion_stats(tier: str = "GOLD", lane: str | None = None, patch: str | None = None) -> list[dict]:
    """Placar de força lido do banco próprio — nunca consulta a Riot em tempo
    real por request do usuário. Os dados vêm do job em app/jobs/collect_stats.py."""
    session = SessionLocal()
    try:
        if patch is None:
            latest = (
                session.query(SegmentTotal.patch)
                .filter_by(tier=tier)
                .order_by(SegmentTotal.patch.desc())
                .first()
            )
            if latest is None:
                return []
            patch = latest[0]

        segment_total = (
            session.query(SegmentTotal.total_matches).filter_by(patch=patch, tier=tier).scalar()
            or 0
        )
        bans = {
            row.champion_id: row.bans
            for row in session.query(ChampionBanStat).filter_by(patch=patch, tier=tier).all()
        }

        query = session.query(ChampionLaneStat).filter_by(patch=patch, tier=tier)
        if lane:
            query = query.filter_by(lane=lane)

        return [
            {
                "champion_id": row.champion_id,
                "lane": row.lane,
                "patch": row.patch,
                "tier": row.tier,
                "games": row.games,
                "win_rate": row.wins / row.games if row.games else 0,
                "pick_rate": row.games / segment_total if segment_total else 0,
                "ban_rate": bans.get(row.champion_id, 0) / segment_total if segment_total else 0,
                "kda": (row.kills + row.assists) / max(row.deaths, 1),
            }
            for row in query.all()
        ]
    finally:
        session.close()
