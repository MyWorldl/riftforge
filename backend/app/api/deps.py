"""Revisão técnica (item 4.2): sessão de banco via `Depends` em vez de
`SessionLocal()` manual repetido em cada rota. Ganho concreto além de menos
ruído: permite injetar uma sessão de teste via
`app.dependency_overrides[get_db]` (pré-requisito do item 1.5 — testes de
rota HTTP)."""

from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
