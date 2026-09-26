"""Database management: python -m app.cli [migrate|seed|init-db|reset-db]"""
import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

from .config import BASE_DIR
from .database import Base, SessionLocal, engine
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def alembic_config() -> Config:
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    return cfg


def migrate(configure_logger: bool = False) -> None:
    cfg = alembic_config()
    cfg.attributes["configure_logger"] = configure_logger  # keep the app's logging intact
    command.upgrade(cfg, "head")


def run_seed() -> None:
    with SessionLocal() as db:
        print(seed(db))


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else "init-db"
    if cmd == "migrate":
        migrate(configure_logger=True)
    elif cmd == "seed":
        run_seed()
    elif cmd == "init-db":
        migrate()
        run_seed()
    elif cmd == "reset-db":
        if "--yes" not in argv:
            sys.exit("reset-db drops ALL data. Re-run with --yes to confirm.")
        from . import models  # noqa: F401

        Base.metadata.drop_all(engine)
        with engine.begin() as conn:
            conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        migrate()
        run_seed()
    else:
        sys.exit(f"unknown command {cmd}")


if __name__ == "__main__":
    main(sys.argv)
