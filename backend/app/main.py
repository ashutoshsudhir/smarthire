import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from .config import get_settings
from .database import SessionLocal, engine
from .llm_client import provider_info
from .routers import admin, auth, candidates, interviews, jds, qa

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("smarthire")
settings = get_settings()

_initialized = False


def _ensure_initialized() -> None:
    global _initialized
    if _initialized:
        return
    try:
        _init_db_if_needed()
        _initialized = True
    except Exception:  # keep serving /health so the problem is visible; retried on next request
        log.exception("database initialisation failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    _ensure_initialized()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="SmartHire API",
    version="1.0.0",
    description="AI-powered screening & interview tracking portal (resume_match + answer_score).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    if not _initialized and request.url.path != "/health":
        # Serverless runtimes may skip ASGI lifespan events: initialise lazily once.
        await run_in_threadpool(_ensure_initialized)
    start = time.perf_counter()
    response = await call_next(request)
    log.info("%s %s -> %s (%dms)", request.method, request.url.path, response.status_code,
             (time.perf_counter() - start) * 1000)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    msg = "; ".join(f"{e['field']}: {e['message']}" if e["field"] else e["message"] for e in errors)
    return JSONResponse(status_code=422, content={"detail": msg or "Invalid request", "errors": errors})


@app.exception_handler(OperationalError)
async def db_unavailable(_: Request, exc: OperationalError):
    log.exception("database unavailable")
    return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable. Please retry."})


@app.exception_handler(SQLAlchemyError)
async def db_error(_: Request, exc: SQLAlchemyError):
    log.exception("database error")
    return JSONResponse(status_code=500, content={"detail": "A database error occurred."})


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def _init_db_if_needed() -> None:
    """Local/dev convenience: migrate + seed an empty database on startup."""
    if not settings.auto_seed:
        return
    from .cli import migrate
    from .seed import seed

    if engine.dialect.name == "postgresql":
        # Serverless cold starts can race: serialise init with a Postgres advisory lock.
        with engine.connect() as conn:
            conn.execute(text("SELECT pg_advisory_lock(424242)"))
            try:
                if "alembic_version" not in inspect(conn).get_table_names():
                    log.info("empty database: running migrations")
                    migrate()
                with SessionLocal() as db:
                    result = seed(db)
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(424242)"))
                conn.commit()
    else:
        if "users" not in inspect(engine).get_table_names():
            log.info("empty database: running migrations")
            migrate()
        with SessionLocal() as db:
            result = seed(db)
    if result.get("seeded"):
        log.info("seeded database: %s", result)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/health/ready", tags=["meta"])
def ready():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:  # noqa: BLE001
        log.warning("readiness db check failed: %s", e)
        db_ok = False
    provider, model = provider_info()
    body = {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable",
            "database_engine": engine.dialect.name, "llm_provider": provider, "llm_model": model}
    return JSONResponse(status_code=200 if db_ok else 503, content=body)


for r in (auth.router, jds.router, candidates.router, qa.router, interviews.router, admin.router):
    app.include_router(r)
