"""Revisão técnica (itens 1.5 + 4.2): fixtures pra testar rotas HTTP de
verdade — viável só depois do refactor pra `Depends(get_db)` (item 4.2),
que permite trocar a sessão real por uma de SQLite in-memory via
`app.dependency_overrides`."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.main import app


@pytest.fixture()
def db_session():
    # `StaticPool` mantém uma única conexão real por trás do engine — sem
    # isso, cada checkout de conexão a `sqlite:///:memory:` abre um banco em
    # memória **separado e vazio**, e `create_all` "some" (as tabelas
    # existem só na conexão em que foram criadas).
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
