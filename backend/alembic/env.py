from logging.config import fileConfig

from sqlalchemy import create_engine
from sqlalchemy import pool

from alembic import context

# Registra as tabelas em `Base.metadata` antes do autogenerate comparar
# qualquer coisa — mesmo motivo do `# noqa: F401` em `app/db/session.py`.
from app.db import models  # noqa: F401
from app.db.base import Base
from app.core.config import get_settings

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# URL resolvida em runtime via `Settings` (lê `.env`/env vars, mesmo
# mecanismo do resto do app), nunca hardcoded em `alembic.ini` (evitaria
# commitar credencial). `migrations_database_url` tem prioridade — deve
# apontar pra conexão DIRETA do Supabase (porta 5432), não o pooler
# pgbouncer (porta 6543) usado por `database_url` em produção: DDL sob
# pgbouncer transaction-mode é instável. Sem essa variável (dev local),
# cai em `settings.database_url` (SQLite por padrão).
#
# Passada direto pro engine (nunca via `config.set_main_option`/
# `alembic.ini`) porque senha com caractere `%` (comum em URL-encoding,
# ex: `%40` = `@`) quebra a interpolação do `configparser` por trás do
# arquivo `.ini`.
_settings = get_settings()
_db_url = _settings.migrations_database_url or _settings.database_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    context.configure(
        url=_db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = create_engine(_db_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        # `render_as_batch` sempre ligado: necessário pro SQLite (dev
        # local) suportar troca de constraint via recriação de tabela —
        # não muda nada de comportamento pro Postgres (Supabase).
        context.configure(
            connection=connection, target_metadata=target_metadata, render_as_batch=True
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
