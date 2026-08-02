"""Revisão técnica §3 (Nível 1): logs estruturados em JSON com
`correlation_id`, substituindo `print(..., flush=True)` — antes disso, se
a coleta diária falhasse, só dava pra descobrir olhando o site vazio;
`import logging` não aparecia em nenhum arquivo do backend.

`correlation_id` costura os eventos de uma mesma execução de job (ou de um
mesmo request HTTP) numa história só — sem ele, cada linha de log é um
evento solto, sem como saber se duas linhas vieram da mesma coleta ou de
duas coletas diferentes rodando em paralelo (o que já acontece: rodada 22
paralelizou `ingest_matches.py`)."""

import logging
import sys
import uuid
from contextvars import ContextVar

import structlog

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")

_configured = False


def new_correlation_id(value: str | None = None) -> str:
    """Gera (ou usa `value`, se vier de um header de request) um novo
    `correlation_id` pro escopo atual — uma execução de job, ou um request
    HTTP."""
    cid = value or uuid.uuid4().hex[:12]
    _correlation_id.set(cid)
    return cid


def _add_correlation_id(logger, method_name, event_dict):
    event_dict["correlation_id"] = _correlation_id.get()
    return event_dict


def configure_logging() -> None:
    """Idempotente — jobs chamados via `python -m app.jobs.X` e o processo
    do servidor FastAPI configuram cada um a sua vez; sem a checagem,
    reconfigurar em cada import duplicaria handlers."""
    global _configured
    if _configured:
        return
    _configured = True

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
    structlog.configure(
        processors=[
            _add_correlation_id,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "riftforge") -> structlog.stdlib.BoundLogger:
    configure_logging()
    return structlog.get_logger(name)
