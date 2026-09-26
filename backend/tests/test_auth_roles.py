from .conftest import cand_headers, login


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_login_success_and_me(client):
    h = login(client, "admin1", "admin123", role="admin")
    me = client.get("/auth/me", headers=h).json()
    assert me["username"] == "admin1" and me["role"] == "admin"


def test_login_candidate_has_candidate_id(client):
    h = cand_headers(client, 3)
    assert client.get("/auth/me", headers=h).json()["candidate_id"] == "cand-3"


def test_login_wrong_password(client):
    r = client.post("/auth/login", json={"username": "admin1", "password": "nope"})
    assert r.status_code == 401


def test_login_role_mismatch(client):
    r = client.post("/auth/login", json={"username": "candidate1", "password": "cand123", "role": "admin"})
    assert r.status_code == 403


def test_passwords_are_hashed(client):
    from app.database import SessionLocal
    from app.models import User

    with SessionLocal() as db:
        assert all(u.password_hash.startswith("pbkdf2_sha256$") for u in db.query(User))


def test_unauthenticated_rejected(client):
    assert client.get("/jds").status_code == 401
    assert client.get("/candidates").status_code == 401
    r = client.get("/jds", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


def test_candidate_cannot_access_admin_endpoints(client):
    h = cand_headers(client, 1)
    assert client.get("/jds", headers=h).status_code == 403
    assert client.get("/candidates", headers=h).status_code == 403
    assert client.get("/audit-logs", headers=h).status_code == 403
    assert client.get("/dashboard/stats", headers=h).status_code == 403
    assert client.post("/jds/jd-1/screen", headers=h).status_code == 403


def test_candidate_sees_only_self(client):
    h = cand_headers(client, 1)
    assert client.get("/candidates/cand-1", headers=h).status_code == 200
    assert client.get("/candidates/cand-2", headers=h).status_code == 404


def test_candidate_cannot_change_status(client):
    h = cand_headers(client, 1)
    r = client.post("/candidates/cand-1/status", headers=h, json={"status": "ACCEPTED"})
    assert r.status_code == 403


def test_interviewer_sees_nothing_unassigned(client, interviewer):
    assert client.get("/interviewer/candidates", headers=interviewer).json() == []
    assert client.get("/candidates/cand-1", headers=interviewer).status_code == 404
    assert client.get("/jds", headers=interviewer).status_code == 403
