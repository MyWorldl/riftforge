from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.models import ChampionScore
from app.schemas.health import HealthResponse

router = APIRouter()
log = get_logger(__name__)


@router.get("/health", response_model=HealthResponse)
def health(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    settings = get_settings()
    checks: dict[str, str] = {}

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = "erro"
        log.warning("health_check_db_falhou", erro=str(exc))
        response.status_code = 503
        return HealthResponse(status="erro", env=settings.app_env, checks=checks)

    latest = (
        db.query(ChampionScore.patch, ChampionScore.computed_at)
        .order_by(ChampionScore.computed_at.desc())
        .first()
    )
    if latest is None:
        # Banco acessível mas nunca rodou o pipeline (ambiente novo) — não é
        # um erro de infraestrutura, só ausência de dado ainda.
        checks["ultimo_patch_calculado"] = "nenhum"
        checks["idade_dado_horas"] = "n/a"
    else:
        patch, computed_at = latest
        if computed_at.tzinfo is None:
            computed_at = computed_at.replace(tzinfo=timezone.utc)
        idade_horas = (datetime.now(timezone.utc) - computed_at).total_seconds() / 3600
        checks["ultimo_patch_calculado"] = patch
        checks["idade_dado_horas"] = f"{idade_horas:.1f}"

    return HealthResponse(status="ok", env=settings.app_env, checks=checks)
