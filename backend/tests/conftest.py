import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"),
    "LLM_PROVIDER": "mock",
    "AUTO_SEED": "false",
    "JWT_SECRET": "test-secret-test-secret-test-secret-123",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import security  # noqa: E402

security._ITERATIONS = 1_000  # fast hashing in tests

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c


def login(client, username, password, role=None):
    body = {"username": username, "password": password}
    if role:
        body["role"] = role
    r = client.post("/auth/login", json=body)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return login(client, "admin1", "admin123")


@pytest.fixture()
def interviewer(client):
    return login(client, "interviewer1", "int123")


def cand_headers(client, n):
    return login(client, f"candidate{n}", "cand123")
