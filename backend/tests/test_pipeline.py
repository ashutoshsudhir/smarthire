import pytest

from .conftest import cand_headers, login
from .helpers import complete_qa


def screen(client, admin, jd):
    r = client.post(f"/jds/{jd}/screen", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def test_resume_threshold_promotes_and_filters(client, admin):
    res = screen(client, admin, "jd-1")
    assert res["screened"] == 4 and not res["errors"]
    for cid in res["promoted"]:
        c = client.get(f"/candidates/{cid}", headers=admin).json()
        assert c["status"] == "SCREENING" and c["resume_score"] >= 70
    for cid in res["filtered"]:
        c = client.get(f"/candidates/{cid}", headers=admin).json()
        assert c["status"] == "FILTERED" and c["resume_score"] < 70
        assert "below threshold" in c["status_reason"]
    detail = client.get(f"/candidates/{res['promoted'][0]}", headers=admin).json()
    ra = detail["resume_analysis"]
    assert set(ra) >= {"score", "matched_skills", "gaps", "summary", "confidence"}


def test_screening_is_idempotent(client, admin):
    screen(client, admin, "jd-1")
    again = screen(client, admin, "jd-1")
    assert again["screened"] == 0  # scores persisted, not recomputed


def test_threshold_is_configurable(client, admin):
    jd = client.get("/jds/jd-1", headers=admin).json()["jd"]
    body = {k: jd[k] for k in ("title", "summary", "must_have", "nice_to_have", "experience_years", "education",
                               "location", "resume_weight", "qa_weight", "hold_margin", "confidence_cutoff",
                               "question_time_limit_sec", "is_active")}
    body["pass_threshold"] = 99
    assert client.put("/jds/jd-1", headers=admin, json=body).status_code == 200
    res = screen(client, admin, "jd-1")
    assert res["promoted"] == [] and len(res["filtered"]) == 4


def test_missing_must_have_skill_is_filtered(client, admin):
    screen(client, admin, "jd-1")
    c = client.get("/candidates/cand-2", headers=admin).json()  # profile: missing TypeScript
    assert c["status"] == "FILTERED"
    assert "TypeScript" in c["resume_analysis"]["gaps"]


def test_strong_candidate_promoted(client, admin):
    screen(client, admin, "jd-3")
    c = client.get("/candidates/cand-8", headers=admin).json()  # strong fit
    assert c["status"] == "SCREENING" and c["resume_score"] >= 85


def test_low_confidence_candidate_flagged(client, admin):
    screen(client, admin, "jd-3")
    c = client.get("/candidates/cand-10", headers=admin).json()  # data-science low confidence
    assert c["resume_confidence"] < 0.6
    assert any(f["code"] == "LOW_RESUME_CONFIDENCE" for f in c["flags"])


def test_overclaim_candidate_low_confidence(client, admin):
    screen(client, admin, "jd-2")
    c = client.get("/candidates/cand-7", headers=admin).json()  # contradictory over-claim
    assert c["status"] == "FILTERED" and c["resume_confidence"] <= 0.6
    assert "over-claiming" in c["resume_analysis"]["summary"]


def test_borderline_candidate_near_threshold(client, admin):
    screen(client, admin, "jd-1")
    c = client.get("/candidates/cand-4", headers=admin).json()  # junior borderline
    assert abs(c["resume_score"] - 70) <= 5
    assert "close to the pass threshold" in c["resume_analysis"]["summary"]


def test_filtered_candidate_cannot_start_qa(client, admin):
    screen(client, admin, "jd-1")
    h = cand_headers(client, 2)
    assert client.post("/candidates/cand-2/screening/start", headers=h).status_code == 409


def test_qa_one_question_at_a_time_and_hidden_rubric(client, admin):
    screen(client, admin, "jd-1")
    h = cand_headers(client, 1)
    r = client.post("/candidates/cand-1/screening/start", headers=h).json()
    assert r["index"] == 1 and r["total"] == 6
    assert set(r["question"]) == {"id", "text"}
    assert r["remaining_sec"] <= r["time_limit_sec"]
    # must answer the current question, not a later one
    bad = client.post("/candidates/cand-1/answers", headers=h, json={"question_id": "q-fe-06", "answer_text": "x"})
    assert bad.status_code == 409
    # another candidate cannot answer for cand-1
    other = cand_headers(client, 3)
    r2 = client.post("/candidates/cand-1/answers", headers=other,
                     json={"question_id": r["question"]["id"], "answer_text": "x"})
    assert r2.status_code == 404


def test_qa_submission_scoring_and_combined_score(client, admin):
    screen(client, admin, "jd-1")
    h = cand_headers(client, 1)
    done = complete_qa(client, h, "cand-1", "jd-1", telemetry={"tab_switches": 2, "paste_count": 1, "copy_count": 0})
    result = done["result"]
    assert result["band"] == "PASS"
    assert "justification" not in str(result) and "rubric" not in str(result)
    d = client.get("/candidates/cand-1", headers=admin).json()
    assert len(d["answers"]) == 6 and all(a["score"] is not None for a in d["answers"])
    qa_total = sum(a["score"] for a in d["answers"])
    qa_norm = round(qa_total / 30 * 100, 1)
    expected = round(d["resume_score"] * 0.6 + qa_norm * 0.4, 1)
    assert d["qa_score"] == qa_norm and d["combined_score"] == expected
    assert result["aggregate_score"] == expected
    assert d["status"] == "PASSED"
    assert d["telemetry"] == {"tab_switches": 12, "paste_count": 6, "copy_count": 0}
    assert any(f["code"] == "ANTI_CHEAT" for f in d["flags"])  # flagged but NOT rejected


def test_weak_answers_hold_or_reject_and_disagreement_flag(client, admin):
    screen(client, admin, "jd-3")
    h = cand_headers(client, 8)  # strong resume ...
    done = complete_qa(client, h, "cand-8", "jd-3", answer_fn=lambda q, ref: "I do not know this one, sorry.")
    assert done["result"]["band"] == "REJECT"  # ... but blank-ish Q&A => contradictory signals
    d = client.get("/candidates/cand-8", headers=admin).json()
    assert d["status"] == "REJECTED"
    assert any(f["code"] == "SCORE_DISAGREEMENT" for f in d["flags"])


def test_band_logic_units():
    from app.models import JobDescription
    from app.services.scoring import combined_score, compute_band

    jd = JobDescription(pass_threshold=70, hold_margin=10, confidence_cutoff=0.6, resume_weight=0.6, qa_weight=0.4)
    assert combined_score(80, 50, jd) == 68.0
    assert compute_band(75, 0.8, jd)[0] == "PASS"
    assert compute_band(75, 0.5, jd)[0] == "HOLD"  # low confidence -> human review
    assert compute_band(65, 0.8, jd)[0] == "HOLD"
    assert compute_band(59.9, 0.9, jd)[0] == "REJECT"


def test_candidate_result_hides_ai_evidence(client, admin):
    screen(client, admin, "jd-1")
    h = cand_headers(client, 1)
    complete_qa(client, h, "cand-1", "jd-1")
    res = client.get("/candidates/cand-1/result", headers=h).json()
    view = client.get("/me/application", headers=h).json()
    blob = str(res) + str(view)
    for secret in ("justification", "rubric", "confidence", "resume_score", "prompt", "flags", "notes"):
        assert secret not in blob
    assert res["band"] in ("PASS", "HOLD", "REJECT")


@pytest.fixture()
def passed_candidate(client, admin):
    screen(client, admin, "jd-1")
    complete_qa(client, cand_headers(client, 1), "cand-1", "jd-1")
    return "cand-1"


def test_interview_assignment_and_interviewer_flow(client, admin, passed_candidate):
    users = client.get("/users?role=interviewer", headers=admin).json()
    iv1 = next(u for u in users if u["username"] == "interviewer1")
    r = client.post("/interviews", headers=admin, json={"candidate_id": passed_candidate, "interviewer_id": iv1["id"],
                                                        "scheduled_at": "2026-10-01T10:00:00Z"})
    assert r.status_code == 201, r.text
    iv_id = r.json()["id"]
    r = client.put(f"/interviews/{iv_id}", headers=admin, json={"scheduled_at": "2026-10-02T11:00:00Z"})
    assert r.status_code == 200 and r.json()["scheduled_at"].startswith("2026-10-02")

    ih = login(client, "interviewer1", "int123")
    assigned = client.get("/interviewer/candidates", headers=ih).json()
    assert [a["id"] for a in assigned] == [passed_candidate]
    detail = client.get(f"/candidates/{passed_candidate}", headers=ih).json()
    assert detail["answers"] and "audit" not in detail
    # interviewer2 cannot see it
    i2 = login(client, "interviewer2", "int123")
    assert client.get(f"/candidates/{passed_candidate}", headers=i2).status_code == 404
    assert client.post(f"/candidates/{passed_candidate}/status", headers=i2, json={"status": "ACCEPTED"}).status_code == 404

    # interviewer can't set arbitrary statuses
    assert client.post(f"/candidates/{passed_candidate}/status", headers=ih, json={"status": "PASSED"}).status_code == 403
    r = client.post(f"/candidates/{passed_candidate}/status", headers=ih, json={"status": "ACCEPTED", "reason": "Solid"})
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTED"
    r = client.post(f"/candidates/{passed_candidate}/notes", headers=ih, json={"body": "Strong React fundamentals"})
    assert r.status_code == 201

    # candidate sees interview + interviewer name, not notes
    ch = cand_headers(client, 1)
    app = client.get("/me/application", headers=ch).json()
    assert app["interview"]["interviewer"]["name"] == "Interviewer 1"
    assert "Strong React" not in str(app)

    # final decision is admin-only
    assert client.post(f"/candidates/{passed_candidate}/final-decision", headers=ih, json={"decision": "HIRED"}).status_code == 403
    r = client.post(f"/candidates/{passed_candidate}/final-decision", headers=admin, json={"decision": "HIRED"})
    assert r.status_code == 200 and r.json()["status"] == "HIRED"

    events = [e["event_type"] for e in client.get(f"/audit-logs?candidate_id={passed_candidate}&limit=500",
                                                   headers=admin).json()["items"]]
    for ev in ("RESUME_SCORED", "CANDIDATE_PROMOTED", "QA_STARTED", "ANSWER_SUBMITTED", "ANSWER_SCORED",
               "INTERVIEW_ASSIGNED", "INTERVIEW_DATE_UPDATED", "STATUS_CHANGED", "INTERVIEW_DECISION",
               "NOTE_ADDED", "FINAL_DECISION"):
        assert ev in events, ev


def test_cannot_assign_unscreened_candidate(client, admin):
    r = client.post("/interviews", headers=admin, json={"candidate_id": "cand-5", "interviewer_id": 13})
    assert r.status_code == 409


def test_next_steps_and_admin_status_override(client, admin, passed_candidate):
    r = client.post(f"/candidates/{passed_candidate}/next-steps", headers=admin, json={"description": "HR Discussion"})
    assert r.status_code == 201
    r = client.post(f"/candidates/{passed_candidate}/status", headers=admin, json={"status": "HOLD", "reason": "Review"})
    assert r.status_code == 200 and r.json()["status"] == "HOLD"
    d = client.get(f"/candidates/{passed_candidate}", headers=admin).json()
    assert d["next_steps"][0]["description"] == "HR Discussion"
    assert d["status_history"][-1]["to_status"] == "HOLD"
    assert any(a["event_type"] == "NEXT_STEP_ADDED" for a in d["audit"])


def test_login_is_audited(client, admin):
    items = client.get("/audit-logs?event_type=LOGIN", headers=admin).json()["items"]
    assert items and items[0]["actor"] == "admin1" and items[0]["role"] == "admin"
