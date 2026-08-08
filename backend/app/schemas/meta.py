from pydantic import BaseModel


class LaneCoverage(BaseModel):
    lane: str
    cobertura: float


class MetaCoverageResponse(BaseModel):
    """Item novo (revisão técnica §6, "contexto por rota"): `cobertura` já
    era calculada por `compute_meta.py` (Camada 4 do score) mas nunca tinha
    endpoint próprio — só entrava agregada dentro de `meta_score`."""

    patch: str | None
    elo_tier: str
    cobertura: list[LaneCoverage]
