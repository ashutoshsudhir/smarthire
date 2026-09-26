from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

settings = get_settings()

if settings.is_sqlite:
    engine = create_engine(settings.sqlalchemy_url, connect_args={"check_same_thread": False})
else:
    # NullPool: safe for serverless (each invocation opens/closes its own connection;
    # use the provider's pooled connection string in production).
    engine = create_engine(settings.sqlalchemy_url, poolclass=NullPool, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
