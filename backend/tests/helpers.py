from app.models import Question
from app.database import SessionLocal


def reference_answers(jd_id):
    with SessionLocal() as db:
        return {q.id: q.reference_answer for q in db.query(Question).filter(Question.jd_id == jd_id)}


def complete_qa(client, headers, cand_id, jd_id, answer_fn=None, telemetry=None):
    """Answer every question; answer_fn(question_id, reference) -> text."""
    refs = reference_answers(jd_id)
    r = client.post(f"/candidates/{cand_id}/screening/start", headers=headers)
    assert r.status_code == 200, r.text
    cur = r.json()
    last = None
    while not cur.get("completed"):
        qid = cur["question"]["id"]
        text = answer_fn(qid, refs[qid]) if answer_fn else refs[qid]
        last = client.post(f"/candidates/{cand_id}/answers", headers=headers, json={
            "question_id": qid, "answer_text": text, "telemetry": telemetry or {}})
        assert last.status_code == 201, last.text
        body = last.json()
        if body["completed"]:
            return body
        cur = body["next"]
    return last.json() if last else cur
