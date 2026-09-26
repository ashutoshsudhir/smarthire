# SmartHire: AI-Powered Screening & Interview Tracking Portal

SmartHire runs the whole hiring funnel in one role-based web app:

```
Job Description → Resume screening (ATS score) → Threshold check → Candidate Q&A
→ AI answer scoring → Combined score → PASS / HOLD / REJECT → Interview assignment
→ Interviewer decision → Final hiring-manager decision
```

Three portals: **Hiring Manager (Admin)**, **Candidate**, **Interviewer**. AI provides evidence
(scores, justifications, confidence, rubric hits). People make every decision.

---

## 1. Architecture

```
┌──────────────────────────┐    HTTPS / JSON (REST)    ┌──────────────────────────────┐
│ React 19 + Vite 8        │ ────────────────────────▶ │ FastAPI (Python 3.12)        │
│ Tailwind CSS 4           │   Bearer JWT              │  auth · RBAC · scoring       │
│ Vercel project: frontend │ ◀──────────────────────── │  audit · REST API            │
└──────────────────────────┘                           │ Vercel project: backend      │
                                                       │ (serverless Python function) │
                                                       └───────┬───────────────┬──────┘
                                                   SQLAlchemy  │               │ llm_client.call(prompt, schema)
                                                               ▼               ▼
                                                   ┌──────────────────┐  ┌──────────────────────┐
                                                   │ PostgreSQL (prod)│  │ LLM API (Anthropic / │
                                                   │ SQLite (local)   │  │ OpenAI / mock)       │
                                                   └──────────────────┘  └──────────────────────┘
```

* **One frontend, one backend, one database, one LLM abstraction.** No queues, agents, Redis or microservices.
* The backend is stateless (JWT + DB), so it runs as a Vercel serverless function. Both apps deploy from this
  repo as two Vercel projects (root directories `frontend/` and `backend/`).
* Production uses **persistent PostgreSQL**; SQLite is only for local development and tests.

### Repository layout

```
smarthire/
├── README.md
├── .gitignore
├── backend/
│   ├── api/index.py              # Vercel entrypoint (exports the FastAPI app)
│   ├── vercel.json               # routes every path to the FastAPI function
│   ├── .python-version           # 3.12
│   ├── requirements.txt          # pinned runtime deps
│   ├── requirements-dev.txt      # + pytest
│   ├── .env.example
│   ├── alembic.ini, alembic/     # migrations (0001_initial)
│   ├── data/Input_Data.json      # supplied seed dataset (source of truth)
│   ├── app/
│   │   ├── main.py               # app, CORS, error handlers, /health, startup init
│   │   ├── config.py             # env-driven settings
│   │   ├── database.py           # engine/session (NullPool on Postgres for serverless)
│   │   ├── models.py             # 13 normalized tables
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   ├── security.py           # PBKDF2 password hashing + JWT
│   │   ├── deps.py               # auth + role/ownership guards
│   │   ├── audit.py              # audit log + status history helpers
│   │   ├── llm_client.py         # call(prompt, schema): providers + retry-once guard
│   │   ├── prompts.py            # the only two prompts: resume_match, answer_score
│   │   ├── services/scoring.py   # thresholds, combined score, bands, flags (business logic)
│   │   ├── services/heuristics.py# deterministic "mock" LLM provider
│   │   ├── views.py              # role-aware serialization (candidate never sees AI evidence)
│   │   ├── seed.py, cli.py       # seeding + migrate/seed/init-db/reset-db commands
│   │   └── routers/              # auth, jds, candidates, qa, interviews, admin
│   └── tests/                    # 39 pytest tests
└── frontend/
    ├── vercel.json               # SPA rewrites (deep links work on refresh)
    ├── .env.example              # VITE_API_URL
    ├── vite.config.js            # fails the build if VITE_API_URL is missing/localhost
    └── src/
        ├── lib/api.js            # axios client, token handling, error messages
        ├── context/AuthContext.jsx
        ├── components/           # UI kit, layout, evidence panels, modals, timeline
        └── pages/{admin,candidate,interviewer}/
```

## 2. Stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, lucide-react icons, sonner toasts |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PyJWT, httpx, Anthropic SDK |
| Database | PostgreSQL (production, via psycopg 3) · SQLite (local dev/tests) |
| AI | `llm_client.call(prompt, schema)` with providers `anthropic`, `openai` (or any OpenAI-compatible URL), `mock` |

## 3. AI design

* Exactly **two single-turn structured prompts** (`app/prompts.py`):
  * `resume_match` → `{score 0-100, matched_skills[], gaps[], summary, confidence 0-1}`
  * `answer_score` → `{score 0-5, justification, confidence 0-1, rubric_hits[]}`
* Output is validated with Pydantic (and JSON-schema structured output where the provider supports it).
  On invalid JSON, schema mismatch, timeout, 429 or 5xx the call is **retried exactly once**, then a clean
  `LLMError` is raised and surfaced (answer marked `FAILED`, flag on the candidate, admin "Retry scoring" button).
* Scores are **persisted and never recomputed** on page refresh. Resume screening only scores unscreened
  candidates unless the admin explicitly re-screens.
* The provider is chosen by `LLM_PROVIDER`; keys come only from env vars. AI code (`llm_client.py`, `prompts.py`)
  is separate from business rules (`services/scoring.py`).
* `mock` provider: deterministic heuristics (skill evidence with negation detection, over-claim detection,
  rubric keyword coverage) so the full demo works with no API key and reproduces the dataset's edge cases.

### Scoring rules (per JD, editable in the UI)

```
resume_score      = resume_match.score                       (0-100)
qa_normalized     = sum(answer scores) / (5 × #questions) × 100
combined          = resume_score × resume_weight + qa_normalized × qa_weight   (weights sum to 1)

PASS    combined ≥ pass_threshold (and average AI confidence ≥ confidence_cutoff)
HOLD    pass_threshold − hold_margin ≤ combined < pass_threshold,
        or combined ≥ threshold but average confidence < cutoff (human review)
REJECT  combined < pass_threshold − hold_margin
```

Resume threshold: `resume_score ≥ pass_threshold` → **SCREENING** (Q&A invite, stubbed as in-app toast + audit event);
otherwise **FILTERED** with the reason stored. `hold_margin` defaults to 10.

Human-in-the-loop flags (never auto-reject): `LOW_RESUME_CONFIDENCE`, `LOW_CONFIDENCE` (avg < cutoff),
`SCORE_DISAGREEMENT` (|resume − Q&A| ≥ 30), `ANTI_CHEAT` (≥3 tab switches or any paste/copy), `SCORING_FAILED`.

## 4. Roles and privacy rules

| | Admin (Hiring Manager) | Interviewer | Candidate |
|---|---|---|---|
| JDs, screening, all candidates, audit log | ✅ | ❌ | ❌ |
| AI evidence (scores, justification, confidence, telemetry) | ✅ | assigned only | ❌ |
| Change status | any (override) | Accepted / Rejected / On-Hold / No-Show, assigned only | ❌ |
| Notes | ✅ | assigned only | ❌ (never visible) |
| Final hiring decision | ✅ only | ❌ | ❌ |
| Own application, interview date, interviewer name, aggregate result + band | | | ✅ |

Unassigned or foreign candidates return **404** (not 403) so users cannot probe for other candidates.

## 5. Database

Tables: `users`, `job_descriptions`, `questions`, `candidates`, `resume_scores`, `screening_attempts`,
`answers` (with timing + anti-cheat telemetry), `answer_scores`, `interviews`, `interviewer_notes`,
`candidate_status_history`, `next_steps`, `audit_logs`. Foreign keys with cascades and indexes on the hot
lookups (candidate, status, event type, timestamps). Passwords are PBKDF2-SHA256 hashed.

Migrations: `backend/alembic/versions/0001_initial_schema.py`.

## 6. API

Interactive docs at `GET /docs` (Swagger) on the backend.

| Method | Path | Who |
|---|---|---|
| GET | `/health` → `{"status":"ok"}` · `/health/ready` (DB + LLM info) | public |
| POST | `/auth/login` · GET `/auth/me` | public / any |
| GET, POST | `/jds` | admin |
| GET, PUT, DELETE | `/jds/{id}` (DELETE refuses JDs with candidates; deactivate instead) | admin |
| POST | `/jds/{id}/questions` | admin |
| POST | `/jds/{id}/screen` `{force?}` (resume_match batch for one JD) | admin |
| POST | `/screening/run-batch` (all active JDs; admin JWT or `X-Admin-Token`) | admin / scheduler |
| GET | `/candidates?jd_id&status&band&q&flagged&sort&order&limit&offset` | admin, interviewer (assigned) |
| GET | `/candidates/{id}` (role-aware view) · `/candidates/{id}/result` | admin, assigned interviewer, self |
| GET | `/me/application` | candidate |
| POST | `/candidates/{id}/promote` (manual override of the filter) | admin |
| POST | `/candidates/{id}/screening/start` | candidate (self) |
| GET | `/candidates/{id}/questions` (candidate: current question only) | self / admin / interviewer |
| POST | `/candidates/{id}/answers` (answer + telemetry; scored immediately) | candidate (self) |
| POST | `/answers/{id}/score` (retry a failed scoring) | admin |
| POST | `/interviews` · PUT `/interviews/{id}` · GET `/interviews` | admin (GET: interviewer own) |
| GET | `/interviewer/candidates` | interviewer |
| POST | `/candidates/{id}/status` | admin, assigned interviewer |
| POST | `/candidates/{id}/final-decision` `{HIRED|REJECTED}` | admin |
| POST | `/candidates/{id}/notes` · `/candidates/{id}/next-steps` | admin/interviewer · admin |
| GET | `/audit-logs?candidate_id&event_type&actor&limit&offset` · `/dashboard/stats` · `/users?role=` | admin |

Errors are JSON `{"detail": "..."}` with proper codes (401, 403, 404, 409, 422, 502 for LLM failure, 503 for DB unavailable).

Audit events: `LOGIN, LOGIN_FAILED, JD_CREATED, JD_UPDATED, JD_DELETED, SCREENING_RUN, RESUME_SCORED,
RESUME_SCORE_FAILED, CANDIDATE_PROMOTED, CANDIDATE_FILTERED, INVITATION_SENT, QA_STARTED, ANSWER_SUBMITTED,
ANSWER_SCORED, ANSWER_SCORE_FAILED, QA_COMPLETED, COMBINED_SCORED, INTERVIEW_ASSIGNED, INTERVIEWER_CHANGED,
INTERVIEW_DATE_UPDATED, INTERVIEW_DECISION, STATUS_CHANGED, FINAL_DECISION, NOTE_ADDED, NEXT_STEP_ADDED`.
Each stores timestamp, actor, role, candidate, JD and metadata.

## 7. Environment variables

**Backend** (`backend/.env.example`)

| Variable | Required in prod | Notes |
|---|---|---|
| `APP_ENV` | yes (`production`) | production refuses SQLite and weak JWT secrets |
| `DATABASE_URL` | yes | PostgreSQL URL (`postgres://…?sslmode=require`). `POSTGRES_URL` is used as a fallback. |
| `JWT_SECRET` | yes | 32+ random chars |
| `CORS_ORIGINS` | yes | the Vercel frontend URL, e.g. `https://smarthire-web.vercel.app` |
| `CORS_ORIGIN_REGEX` | no | e.g. `https://smarthire-web-.*\.vercel\.app` for preview deployments |
| `LLM_PROVIDER` | yes | `anthropic`, `openai` or `mock` |
| `LLM_API_KEY` | if not mock | never commit it |
| `LLM_MODEL`, `LLM_BASE_URL`, `LLM_TIMEOUT_SECONDS`, `LLM_EFFORT` | no | overrides |
| `AUTO_SEED` | no (default `true`) | migrate + seed an empty DB on first request (Postgres advisory lock) |
| `ADMIN_API_TOKEN` | no | for scheduled `POST /screening/run-batch` |

**Frontend**: `VITE_API_URL` = public backend URL (no trailing slash). The build fails if it is missing or points to localhost.

## 8. Local setup

```bash
# Backend (SQLite, mock LLM, auto-seeded on first start)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000          # http://localhost:8000/docs

# Frontend
cd ../frontend
npm install
npm run dev                                        # http://localhost:5173 (uses .env.development)
```

Database commands (work against whatever `DATABASE_URL` points to):

```bash
python -m app.cli migrate            # alembic upgrade head
python -m app.cli seed               # seed Input_Data.json (idempotent: skipped if users exist)
python -m app.cli init-db            # migrate + seed
python -m app.cli reset-db --yes     # DROP everything, migrate, reseed (demo reset)
```

Local PostgreSQL: set `DATABASE_URL=postgresql://user:pass@localhost:5432/smarthire` and run `python -m app.cli init-db`.

## 9. Tests

```bash
cd backend && pytest                       # SQLite
TEST_DATABASE_URL=postgresql://…/smarthire_test pytest   # same suite on Postgres
```

39 tests cover login, bad password, role mismatch, hashed passwords, unauthenticated/unauthorized access,
role isolation (candidate self-only, interviewer assigned-only), JD CRUD + weight validation, candidate
retrieval/sort/filter, resume threshold promote/filter, configurable threshold, idempotent screening,
Q&A one-at-a-time + hidden rubric, combined-score math, PASS/HOLD/REJECT bands incl. low-confidence HOLD,
candidate result privacy, interview assignment/date change, interviewer decisions + notes, final decision,
next steps, audit events, LLM retry-once and clean failure, and the dataset edge cases:
strong fit (cand-8), missing must-have (cand-2 TypeScript), borderline (cand-4), low confidence (cand-10),
over-claim (cand-7), contradictory resume vs Q&A (strong resume + weak answers → `SCORE_DISAGREEMENT`).

## 10. Deployment (Vercel + PostgreSQL)

Two Vercel projects from this one repository:

| Project | Root directory | Framework | Env vars |
|---|---|---|---|
| `smarthire-api` | `backend` | Other (uses `backend/vercel.json`) | `APP_ENV`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `LLM_PROVIDER`, `LLM_API_KEY` |
| `smarthire-web` | `frontend` | Vite | `VITE_API_URL=https://<smarthire-api>.vercel.app` |

1. **Database**: create a PostgreSQL database (e.g. Neon free tier, or Vercel → Storage → Neon, which sets
   `DATABASE_URL` automatically). Use the pooled connection string with `sslmode=require`.
2. **Backend**:
   ```bash
   cd backend
   vercel link --project smarthire-api
   vercel env add APP_ENV production        # production
   vercel env add DATABASE_URL production
   vercel env add JWT_SECRET production     # python -c "import secrets;print(secrets.token_hex(32))"
   vercel env add LLM_PROVIDER production   # anthropic | openai | mock
   vercel env add LLM_API_KEY production
   vercel env add CORS_ORIGINS production   # https://smarthire-web.vercel.app
   vercel deploy --prod
   curl https://smarthire-api.vercel.app/health        # {"status":"ok"}
   curl https://smarthire-api.vercel.app/health/ready  # database ok, postgresql
   ```
   Tables and seed data are created on the first request (`AUTO_SEED=true`, serialized with a Postgres
   advisory lock). Alternatively run `DATABASE_URL=… python -m app.cli init-db` from any machine.
3. **Frontend**:
   ```bash
   cd frontend
   vercel link --project smarthire-web
   vercel env add VITE_API_URL production   # https://smarthire-api.vercel.app
   vercel deploy --prod
   ```
4. Put the final frontend URL in the backend's `CORS_ORIGINS` and redeploy the backend.

`frontend/vercel.json` rewrites every path to `index.html`, so deep links like `/admin/candidates/cand-1`
load on refresh. `backend/vercel.json` routes every path to the FastAPI function (`api/index.py`).

## 11. Demo accounts (from Input_Data.json)

| Role | Usernames | Password |
|---|---|---|
| Admin / Hiring Manager | `admin1`, `admin2` | `admin123` |
| Candidate | `candidate1` … `candidate10` | `cand123` |
| Interviewer | `interviewer1`, `interviewer2` | `int123` |

Passwords are stored hashed; the login page lists usernames only.

Candidate ↔ job mapping: `candidate1-4` Frontend (jd-1), `candidate5-7` Java (jd-2), `candidate8-10` Python (jd-3).
With the mock provider, jd-1 screening promotes candidate1, candidate3, candidate4 (borderline 70.1) and filters
candidate2 (missing TypeScript).

## 12. Hackathon demo flow (tested end-to-end in a browser)

1. Sign in as **admin1** (Hiring Manager) → dashboard (stats, pipeline funnel, flags, activity).
2. **Jobs → Frontend Developer**. Opening the JD auto-runs `resume_match` for unscreened resumes
   (the **Run resume screening** button does the same; **Re-screen** re-scores after config changes).
3. Show ATS score, matched skills, gaps, summary, confidence per candidate; candidate1/3/4 → **Screening**,
   candidate2 → **Filtered** with the reason.
4. Open a new tab (sessions are per tab) and sign in as **candidate1** → invitation toast → **Start screening**.
5. Answer 6 questions one at a time (progress bar, per-question timer, auto-submit at 0; tab switches,
   pastes and question copies are counted silently).
6. Result: aggregate combined score, category breakdown, PASS/HOLD/REJECT band. No justifications or raw scores.
7. Back as admin: **Candidates → candidate1 → Q&A** shows per-answer AI score, justification, confidence,
   rubric hits, timing and anti-cheat counts.
8. **Assign interviewer** → interviewer1 + date. Add a **Next step** (e.g. Technical Round 2).
9. Sign in as **interviewer1** → only candidate1 is listed → review evidence → **Accepted** → add a note.
10. Back as admin → **Audit** tab (or **Audit Logs** page) shows the full trail → **Final decision → Hire**.
11. candidate1 now sees *Hired*, the interview date and the interviewer's name.

Reset the demo data at any time: `DATABASE_URL=… python -m app.cli reset-db --yes`.

## 13. Assumptions and limitations

* Hard-coded users from the dataset; no sign-up, password reset or SSO (out of scope per spec).
* Invitations are stubbed (toast + `INVITATION_SENT` audit event + server log); no email/SMS.
* The candidate result shows the aggregate score, Q&A breakdown and band as requested. The raw resume ATS
  score is shown only as a qualitative "profile match" level.
* The resume threshold uses the JD `pass_threshold` (the dataset has one threshold per JD).
* Interviewer decisions set the candidate status (as in the spec); the hiring manager's final decision
  (`HIRED`/`REJECTED`) is separate and admin-only.
* The mock provider is a heuristic stand-in for demos; use `LLM_PROVIDER=anthropic|openai` for real AI scoring.
* Tokens are kept in `sessionStorage` (per tab, cleared on close), which suits a demo where several roles
  are open side by side.
* Batch screening can be triggered by an admin or a scheduler (`X-Admin-Token`); no scheduler is configured by default.
