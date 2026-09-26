import pytest

from app import llm_client
from app.prompts import AnswerScoreOutput


def test_retry_once_then_success(monkeypatch):
    calls = []

    def fake(prompt, schema, model, timeout, mock):
        calls.append(prompt)
        return "not json" if len(calls) == 1 else '{"score": 4, "justification": "ok", "confidence": 0.8, "rubric_hits": []}'

    monkeypatch.setattr(llm_client, "_mock_complete", fake)
    res = llm_client.call("p", AnswerScoreOutput, mock=lambda: {})
    assert res.data.score == 4 and res.attempts == 2 and len(calls) == 2
    assert "not valid JSON" in calls[1]


def test_retry_exactly_once_then_clean_error(monkeypatch):
    calls = []

    def fake(prompt, schema, model, timeout, mock):
        calls.append(1)
        return '{"score": 9}'  # schema-invalid

    monkeypatch.setattr(llm_client, "_mock_complete", fake)
    with pytest.raises(llm_client.LLMError):
        llm_client.call("p", AnswerScoreOutput, mock=lambda: {})
    assert len(calls) == 2  # never loops


def test_transient_error_retried_once(monkeypatch):
    calls = []

    def fake(prompt, schema, model, timeout, mock):
        calls.append(1)
        raise llm_client._Transient("timeout")

    monkeypatch.setattr(llm_client, "_mock_complete", fake)
    with pytest.raises(llm_client.LLMError, match="timeout"):
        llm_client.call("p", AnswerScoreOutput, mock=lambda: {})
    assert len(calls) == 2


def test_extract_json_strips_fences():
    assert llm_client.extract_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert llm_client.extract_json('Sure! {"a": 1} hope that helps') == '{"a": 1}'


def test_failed_answer_scoring_surfaces_and_can_be_retried(client, admin, monkeypatch):
    from .conftest import cand_headers
    from .helpers import complete_qa

    client.post("/jds/jd-1/screen", headers=admin)
    real = llm_client._mock_complete
    monkeypatch.setattr(llm_client, "_mock_complete", lambda *a: "garbage")
    done = complete_qa(client, cand_headers(client, 1), "cand-1", "jd-1")
    assert done["result"]["available"] is False  # no silent band
    d = client.get("/candidates/cand-1", headers=admin).json()
    assert all(a["score_status"] == "FAILED" for a in d["answers"])
    assert any(f["code"] == "SCORING_FAILED" for f in d["flags"])
    monkeypatch.setattr(llm_client, "_mock_complete", real)
    for a in d["answers"]:
        assert client.post(f"/answers/{a['id']}/score", headers=admin).status_code == 200
    d = client.get("/candidates/cand-1", headers=admin).json()
    assert d["band"] in ("PASS", "HOLD", "REJECT") and d["status"] in ("PASSED", "HOLD", "REJECTED")
