from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db import models  # noqa: F401 — registers tables on Base.metadata
from app.db.base import Base

settings = get_settings()
_is_sqlite = settings.database_url.startswith("sqlite")

# Serverless functions (Vercel) get a fresh process per cold start and don't
# benefit from a persistent connection pool — NullPool avoids leaking
# connections against Supabase's connection limit. Use the pooler connection
# string (port 6543) for DATABASE_URL in that environment.
#
# `pool_pre_ping` testa a conexão antes de entregá-la: o Supabase derruba
# conexões que ficam muito tempo abertas, e sem isso a primeira query
# depois da queda estoura com "server closed the connection unexpectedly"
# em vez de reconectar. Jobs longos devem, além disso, escopar a sessão em
# blocos curtos — ver app/jobs/ingest_matches.py.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {"connect_timeout": 10},
    poolclass=NullPool if not _is_sqlite else None,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
