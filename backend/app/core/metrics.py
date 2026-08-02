"""Revisão técnica §3 (Nível 2): interface de métricas pronta pra conectar
num backend real (Datadog) quando houver conta/API key — sem uma, vira no-op
em vez de derrubar o app tentando falar com um serviço não configurado.
Serviços/jobs chamam estas funções sem saber se um Nível 2 está de fato
conectado ou não.

Uso: python -c "from app.core.metrics import increment; increment('job.execucoes', tags=['job:compute_scores'])"
"""

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


def _enabled() -> bool:
    return bool(get_settings().datadog_api_key)


def increment(metric: str, value: int = 1, tags: list[str] | None = None) -> None:
    if not _enabled():
        return
    log.info("metric_increment", metric=metric, value=value, tags=tags or [])


def gauge(metric: str, value: float, tags: list[str] | None = None) -> None:
    if not _enabled():
        return
    log.info("metric_gauge", metric=metric, value=value, tags=tags or [])


def histogram(metric: str, value: float, tags: list[str] | None = None) -> None:
    if not _enabled():
        return
    log.info("metric_histogram", metric=metric, value=value, tags=tags or [])
