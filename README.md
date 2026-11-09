# Patient Follow-up System — EPIA Technical Assessment

A small patient follow-up system built with **Node.js + Express + SQLite**.

* **Task 1 – Backend:** REST API to add patients, list them, find follow-ups due today, and mark follow-ups completed.
* **Task 2 – AI automation:** finds patients whose follow-up is due, drafts a personalised WhatsApp message with an AI model, and **holds every draft for staff review and approval**. **Nothing is ever sent automatically.**

> All data is **fictional**. No real WhatsApp connection exists in this project.

---

## Requirements

* Node.js **20.6+** (developed on Node 22)
* npm

## Setup & run

```bash
npm install
cp .env.example .env        # optional – only needed to enable the live AI call
npm run seed                # optional – inserts 5 fictional patients (dates relative to today)
npm start                   # http://localhost:3000
```

Open **http://localhost:3000** for the staff review console (UI), or use the API directly.

### Run the automated tests

```bash
npm test
```
9 tests cover validation, due-today logic, status updates, error codes, and the full draft → edit → approve workflow (in-memory database, mock AI).

## Dependencies

| Package | Why |
|---|---|
| `express` | HTTP server / routing |
| `better-sqlite3` | Lightweight embedded SQLite store (file: `data/followup.db`) |

No other runtime dependencies. The AI call uses Node's built-in `fetch`; tests use the built-in `node:test`.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./data/followup.db` | SQLite file |
| `ANTHROPIC_API_KEY` | *(empty)* | If set → live AI drafts. If empty → **mock** drafts |
| `AI_MODEL` | `claude-sonnet-4-5` | Model name for the live call |
| `CLINIC_NAME` | `Sunrise Family Clinic` | Used in drafts |

---

## API reference

Base URL: `http://localhost:3000`. All bodies are JSON. Errors look like `{"error": "...", "details": [...]}`.

### Task 1 — Patients

| Method & path | Purpose | Success |
|---|---|---|
| `POST /api/patients` | Add a patient | `201` + patient |
| `GET /api/patients` | List all patients | `200` + array |
| `GET /api/patients/due-today` | Pending follow-ups due **today** | `200` `{date,count,patients}` |
| `GET /api/patients/:id` | Get one patient | `200` |
| `PATCH /api/patients/:id/follow-up` | Set follow-up status | `200` + patient |

**Add a patient**
```bash
curl -X POST localhost:3000/api/patients -H 'content-type: application/json' -d '{
  "name": "Asha Verma",
  "phone": "+919000000001",
  "consultationDate": "2026-11-02",
  "followUpDate": "2026-11-09"
}'
```
Validation: `name` 2–100 chars; `phone` 10–15 digits (optional `+`, spaces/dashes allowed); both dates must be real `YYYY-MM-DD` dates; `followUpDate` cannot be before `consultationDate`.

**Due today** — optional query params: `?includeOverdue=true` (also return past-due pending follow-ups) and `?date=YYYY-MM-DD` (override "today", useful for testing).

**Mark completed**
```bash
curl -X PATCH localhost:3000/api/patients/1/follow-up -H 'content-type: application/json' -d '{"status":"completed"}'
```
`status` may be `completed` or `pending` (re-open). Setting a status the patient already has returns `409`.

### Task 2 — AI follow-up drafts (human-in-the-loop)

| Method & path | Purpose |
|---|---|
| `POST /api/followups/generate` | Find due/overdue pending patients and create one draft each (`pending_review`). Skips patients who already have an unreviewed draft. Optional body `{"date":"YYYY-MM-DD"}` |
| `GET /api/drafts` | List drafts (`?status=pending_review`, `approved` or `rejected`) |
| `PATCH /api/drafts/:id` | Staff edits the text (only while `pending_review`) — body `{"message":"..."}` |
| `POST /api/drafts/:id/approve` | Staff approves — body `{"reviewer":"Name"}`. Returns a `whatsappLink` (`wa.me` with text pre-filled) that staff open and send **manually** |
| `POST /api/drafts/:id/reject` | Staff rejects |

Status codes: `400` validation, `404` not found, `409` invalid state change (e.g. approving an already-reviewed draft), `500` unexpected.

### Workflow

```
Patients table ──► POST /followups/generate ──► AI (or mock) writes draft
                                                      │
                                         status = pending_review   (NOT sent)
                                                      │
                          Staff reads / edits ──► approve | reject
                                                      │
                     approved ──► wa.me link; a human presses Send in WhatsApp
```

## AI behaviour, privacy and the mock limitation

* **Live mode** (`ANTHROPIC_API_KEY` set): one API call per due patient. Only the patient's **first name and dates** are sent — never the phone number. The prompt forbids medical advice/diagnoses.
* **Mock mode** (no key, or the API call fails): a deterministic template draft is used so the workflow still runs. Every draft carries `source: "ai"` or `"mock"`, and the UI labels mock drafts clearly.
* **Limitation:** mock drafts are templated, not model-generated, so they are less varied. The review/approval flow is identical in both modes.

## How to test manually (2-minute path)

1. `npm run seed && npm start`, open http://localhost:3000.
2. Check **Follow-ups due** shows today's + overdue patients.
3. Click **Generate WhatsApp drafts** → drafts appear as *pending review*.
4. Edit one draft, **Approve** it, **Reject** another → approved draft shows the manual WhatsApp link.
5. Click **Mark completed** on a patient → they disappear from the due list.
6. Bad request: `curl -X POST localhost:3000/api/patients -H 'content-type: application/json' -d '{}'` → `400` with details.

## Project structure

```
src/app.js         routes + error handling
src/db.js          SQLite schema
src/validation.js  input validation, date helpers
src/ai.js          AI draft generation + mock fallback
src/server.js      entry point
scripts/seed.js    fictional sample data
public/index.html  staff review console
test/api.test.js   automated tests
```

## Design decisions & possible improvements

* SQLite for zero-setup persistence; prepared statements prevent SQL injection.
* "Due today" means exactly today; the generator also covers **overdue** pending patients, since missed follow-ups matter most.
* Dates are `YYYY-MM-DD` strings in the server's local timezone.
* Next steps: staff authentication, audit log, WhatsApp Business API integration *after* approval, per-clinic templates, timezone handling.
