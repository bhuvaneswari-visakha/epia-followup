# AI Tools Used & My Contribution

**Name:** Bhuvana  |  **Assessment:** EPIA – Backend & AI Automation Internship

## AI tools used

1. **Claude (Anthropic)** — coding assistant used to scaffold the Express/SQLite project, draft the validation helpers, the test suite, the staff review UI and the first draft of the documentation.
2. **Claude via API (runtime, optional)** — the application calls an LLM to write WhatsApp follow-up drafts when `ANTHROPIC_API_KEY` is set. Without a key it uses a mock template, clearly labelled in the UI and README.

## What I personally did

> ✏️ **EDIT THIS SECTION before submitting so it reflects what you genuinely did.** Keep only the points that are true:

* Read, ran and understood every file; I can explain each endpoint, the schema and the approval flow.
* Chose the design: SQLite, follow-up status `pending → completed`, draft states `pending_review / approved / rejected`, and "no auto-send" as a hard rule (approval only produces a manual `wa.me` link).
* Decided validation rules (phone length, real calendar dates, follow-up not before consultation).
* Decided the privacy rule: only first name + dates go to the AI; the phone number never does.
* Ran the automated and manual tests, recorded the demo video.
* Tuned the AI prompt wording (short, warm, no medical advice).

## What the AI generated / helped with

* Initial boilerplate for routes, schema and tests.
* First version of the single-page review console.
* First draft of the README.

## Verification

* `npm test` → 9/9 passing.
* Manual end-to-end run: seed → due list → generate drafts → edit/approve/reject → mark completed.
* Known limitation: the live AI path needs an API key; without one, the mock path is what is demonstrated.
