"""Deterministic heuristics used by the ``mock`` LLM provider.

They let the whole product be demoed without an API key, while producing plausible,
explainable output for the edge cases in Input_Data.json (missing must-haves, negated
skills, over-claiming, borderline candidates, low confidence).
"""
import re

NEGATIONS = re.compile(
    r"\b(no|not|never|without|lacks?|limited|yet to|has not|hasn't|learning|interested in|self-learning)\b",
    re.I,
)

# Skill -> regex alternatives (lower-case). Unknown skills fall back to tokenisation.
ALIASES: dict[str, list[str]] = {
    "JavaScript (ES6+)": [r"javascript", r"es6", r"typescript"],
    "HTML5": [r"html5?", r"css3?", r"tailwind\w*"],
    "CSS3": [r"css3?", r"tailwind\w*"],
    "REST API integration": [r"rest api", r"axios", r"restful", r"rest"],
    "Redux or Context API": [r"redux", r"context api"],
    "Responsive Design": [r"responsive"],
    "Jest / React Testing Library": [r"jest", r"react testing library"],
    "Web Accessibility (a11y)": [r"accessibility", r"a11y", r"wcag"],
    "TailwindCSS": [r"tailwind\w*"],
    "Java 11+": [r"java (1[1-9]|2\d)"],
    "RESTful Web Services": [r"restful", r"rest api"],
    "JPA / Hibernate": [r"jpa", r"hibernate"],
    "SQL (PostgreSQL / MySQL)": [r"sql", r"postgresql", r"mysql", r"oracle"],
    "Microservices Architecture": [r"microservices?"],
    "Kafka / RabbitMQ": [r"kafka", r"rabbitmq"],
    "Spring Security / OAuth2": [r"spring security", r"oauth2?"],
    "CI/CD (Jenkins / GitHub Actions)": [r"ci/cd", r"jenkins", r"github actions"],
    "Python 3.9+": [r"python"],
    "FastAPI or Flask or Django": [r"fastapi", r"flask", r"django"],
    "REST API design": [r"rest api", r"restful", r"openapi", r"rest framework"],
    "SQLAlchemy or Django ORM": [r"sqlalchemy", r"django orm"],
    "Unit Testing (pytest)": [r"pytest", r"unit test"],
    "Git": [r"git(hub)?"],
    "Object Oriented Programming": [r"oop", r"object[- ]oriented"],
    "Async / Asyncio": [r"async(io)?"],
    "Pandas / NumPy": [r"pandas", r"numpy"],
    "AWS (Lambda / S3 / EC2)": [r"aws", r"lambda", r"ec2"],
    "CI/CD": [r"ci/cd", r"github actions", r"jenkins"],
}


def _alternatives(skill: str) -> list[str]:
    if skill in ALIASES:
        return ALIASES[skill]
    parts = re.split(r"\s+or\s+|/|\(|\)|,", skill)
    alts = []
    for p in parts:
        p = re.sub(r"\d+(\.\d+)*\+?", "", p).strip().lower()
        if len(p) >= 2:
            alts.append(re.escape(p))
    return alts or [re.escape(skill.lower())]


def _clauses(text: str) -> list[str]:
    return [c for c in re.split(r"(?<=[.;])\s+", text) if c.strip()]


def skill_evidence(skill: str, resume: str) -> str:
    """Return 'present', 'negated' or 'absent'."""
    found_negated = False
    for alt in _alternatives(skill):
        pat = re.compile(rf"(?<![a-z0-9]){alt}s?(?![a-z0-9])", re.I)
        for clause in _clauses(resume):
            if pat.search(clause):
                if NEGATIONS.search(clause):
                    found_negated = True
                else:
                    return "present"
    return "negated" if found_negated else "absent"


def resume_match(jd: dict, resume: str, experience_years: int) -> dict:
    must, nice = jd["must_have"], jd["nice_to_have"]
    must_ev = {s: skill_evidence(s, resume) for s in must}
    nice_ev = {s: skill_evidence(s, resume) for s in nice}
    matched = [s for s, e in {**must_ev, **nice_ev}.items() if e == "present"]
    gaps = [s for s, e in must_ev.items() if e != "present"] + [
        f"{s} (nice-to-have)" for s, e in nice_ev.items() if e != "present"
    ]
    must_cov = sum(e == "present" for e in must_ev.values()) / max(len(must), 1)
    nice_cov = sum(e == "present" for e in nice_ev.values()) / max(len(nice), 1)
    req = max(jd.get("experience_years") or 0, 1)
    exp_fit = min((experience_years or 0) / req, 1.0)
    score = 100 * (0.65 * must_cov + 0.20 * nice_cov + 0.15 * exp_fit)

    notes = []
    confidence = 0.9
    negated = [s for s, e in must_ev.items() if e == "negated"]
    if negated:
        score -= 8 * len(negated)  # explicitly missing must-haves weigh more than silence
        confidence -= 0.08 * len(negated)
        notes.append(f"resume explicitly signals weak/missing {', '.join(negated)}")
    skills_list = re.search(r"skills:\s*(.*?)\.\s", resume, re.I)
    listed = len(skills_list.group(1).split(",")) if skills_list else 0
    if (experience_years or 0) <= 1 and listed >= 12:
        score -= 10
        confidence -= 0.3
        notes.append("long skills list relative to 1 year of experience suggests over-claiming")
    headline = resume.split(".")[0].lower()
    if not re.search(r"developer|engineer", headline):
        confidence -= 0.15
        notes.append("resume headline does not describe a matching developer role")
    if abs(score - jd.get("pass_threshold", 70)) <= 5:
        confidence -= 0.12
        notes.append("score is close to the pass threshold")
    if (experience_years or 0) >= req + 3:
        notes.append("candidate may be overqualified for the stated level")
    score = max(0.0, min(97.0, round(score, 1)))
    confidence = round(max(0.3, min(0.95, confidence)), 2)

    summary = (
        f"Matches {sum(e == 'present' for e in must_ev.values())}/{len(must)} must-have and "
        f"{sum(e == 'present' for e in nice_ev.values())}/{len(nice)} nice-to-have skills for "
        f"{jd['title']} with {experience_years} yrs vs {jd.get('experience_years')} required."
    )
    if notes:
        summary += " Note: " + "; ".join(notes) + "."
    return {"score": score, "matched_skills": matched, "gaps": gaps, "summary": summary,
            "confidence": confidence}


STOP = set(
    "the and for with that this from into only when than then them they their there which "
    "about your have using used uses what does also each such more most very over would should "
    "could because while where will just like make makes made mentions explains provides least "
    "correct correctly clear clearly example examples concept detail details".split()
)


def _keywords(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z0-9_@.+#-]{3,}", text.lower()) if w not in STOP}


def answer_score(question: str, reference: str, rubric: dict, answer: str) -> dict:
    words = answer.split()
    if len(words) < 5:
        return {"score": 0, "justification": "Answer is empty or too short to evaluate.",
                "confidence": 0.9, "rubric_hits": []}
    ans_kw = _keywords(answer)
    ref_kw = _keywords(reference) | set().union(*[_keywords(c) for c in rubric.get("score_5", [])] or [set()])
    coverage = len(ans_kw & ref_kw) / max(len(ref_kw), 1)

    hits = []
    for crit in rubric.get("score_5", []) + rubric.get("score_3", []):
        ck = _keywords(crit)
        if ck and len(ans_kw & ck) / len(ck) >= 0.4:
            hits.append(crit)
    strong_hits = [h for h in hits if h in rubric.get("score_5", [])]

    if coverage >= 0.40 or len(strong_hits) >= 3:
        score = 5
    elif coverage >= 0.28 or len(strong_hits) >= 2:
        score = 4
    elif coverage >= 0.18 or strong_hits:
        score = 3
    elif coverage >= 0.10 or hits:
        score = 2
    elif coverage > 0.04:
        score = 1
    else:
        score = 0

    confidence = 0.85
    if len(words) < 25:
        confidence -= 0.2
    if score in (2, 3, 4):
        confidence -= 0.1
    confidence = round(max(0.35, min(0.95, confidence)), 2)

    if score == 0:
        just = "Answer does not address the key concepts in the rubric."
    elif strong_hits:
        just = f"Covers {len(strong_hits)} top-band rubric point(s), e.g. '{strong_hits[0]}'."
        if score < 5:
            just += " Missing other top-band points."
    else:
        just = "Partially relevant; top-band rubric points are not clearly covered."
    return {"score": score, "justification": just, "confidence": confidence, "rubric_hits": hits}
