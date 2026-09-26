def test_list_seeded_jds(client, admin):
    jds = client.get("/jds", headers=admin).json()
    assert [j["id"] for j in jds] == ["jd-1", "jd-2", "jd-3"]
    fe = jds[0]
    assert fe["title"] == "Frontend Developer" and fe["pass_threshold"] == 70
    assert fe["candidate_count"] == 4 and fe["question_count"] == 6


def test_jd_crud(client, admin):
    body = {"title": "Data Engineer", "must_have": ["Python", "SQL", "Airflow"], "nice_to_have": ["Spark"],
            "experience_years": 3, "education": "B.Tech", "location": "Pune", "resume_weight": 0.5,
            "qa_weight": 0.5, "pass_threshold": 65, "confidence_cutoff": 0.6}
    r = client.post("/jds", headers=admin, json=body)
    assert r.status_code == 201, r.text
    jd_id = r.json()["id"]
    assert jd_id == "jd-4"
    body["pass_threshold"] = 75
    r = client.put(f"/jds/{jd_id}", headers=admin, json=body)
    assert r.status_code == 200 and r.json()["pass_threshold"] == 75
    assert client.get(f"/jds/{jd_id}", headers=admin).json()["jd"]["title"] == "Data Engineer"
    assert client.delete(f"/jds/{jd_id}", headers=admin).status_code == 204
    assert client.get(f"/jds/{jd_id}", headers=admin).status_code == 404
    events = [e["event_type"] for e in client.get("/audit-logs", headers=admin).json()["items"]]
    assert {"JD_CREATED", "JD_UPDATED", "JD_DELETED"} <= set(events)


def test_jd_weights_must_sum_to_one(client, admin):
    r = client.post("/jds", headers=admin, json={"title": "X role", "must_have": ["a"], "resume_weight": 0.7,
                                                 "qa_weight": 0.7})
    assert r.status_code == 422
    assert "resume_weight + qa_weight" in r.json()["detail"]


def test_cannot_delete_jd_with_candidates(client, admin):
    assert client.delete("/jds/jd-1", headers=admin).status_code == 409


def test_candidate_retrieval_filters_and_sort(client, admin):
    r = client.get("/candidates?jd_id=jd-2", headers=admin).json()
    assert r["total"] == 3
    client.post("/jds/jd-2/screen", headers=admin)
    rows = client.get("/candidates?jd_id=jd-2&sort=resume_score&order=desc", headers=admin).json()["items"]
    scores = [x["resume_score"] for x in rows]
    assert scores == sorted(scores, reverse=True)
    filt = client.get("/candidates?status=FILTERED", headers=admin).json()["items"]
    assert all(x["status"] == "FILTERED" for x in filt)
