# Admin And Research Ops

Operational guide for the single admin (the researcher) running PrincipleLearn V3 for an S2 thesis. Covers admin pages, the RM2/RM3 research pipeline, common day-to-day tasks, and the modules that are intentionally not in active research use.

Cross-reference docs:

- [api-reference.md](./api-reference.md) for endpoint payload details
- [database-and-data-model.md](./database-and-data-model.md) for table schemas
- [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
- [feature-flows.md](./feature-flows.md) for end-to-end user flows
- [thesis/](./thesis/) for the research framing

## 1. Admin Login And Access

- URL: `/admin/login` (page in [src/app/admin/login/](../src/app/admin/login/))
- Backing endpoint: `POST /api/admin/login` ([route](../src/app/api/admin/login/route.ts))
- Role check: middleware ([middleware.ts](../middleware.ts)) and [src/lib/api-middleware.ts](../src/lib/api-middleware.ts) enforce `role.toLowerCase() === 'admin'`. The JWT payload usually carries `ADMIN` (uppercase) but the lowercase compare keeps both shapes safe.
- Single admin: this deployment has one admin (`expantrixmedia@gmail.com`) plus `sal@expandly.id` as protected non-deletable test account. Do not soft-delete either account during data migrations.
- CSRF: `POST` to admin endpoints requires the double-submit `x-csrf-token` header matching the `csrf_token` cookie. Front-end calls go through `apiFetch()` ([src/lib/api-client.ts](../src/lib/api-client.ts)) which handles this automatically.

## 2. Admin Pages Overview

The admin tree lives in [src/app/admin/](../src/app/admin/). Folder names are Indonesian.

| Page | Path | Purpose | Backing endpoints |
|------|------|---------|-------------------|
| Dashboard | [admin/dashboard](../src/app/admin/dashboard/) | Aggregate KPIs (active students, course count, quiz accuracy, RM2 stage distribution, RM3 indicator counts, recent api_log errors) | `GET /api/admin/dashboard`, `GET /api/admin/insights` |
| Aktivitas | [admin/aktivitas](../src/app/admin/aktivitas/) | Drill-down feed of student activity per module: ask-question, challenge, quiz, refleksi, transcript, examples, generate-course | `GET /api/admin/activity/{ask-question,challenge,quiz,jurnal,transcript,examples,generate-course,feedback,actions,topics,courses,learning-profile,analytics,search,export}` |
| Siswa | [admin/siswa](../src/app/admin/siswa/) and [admin/siswa/[id]](../src/app/admin/siswa/[id]/) | Per-student list + detail view with `evolusi` longitudinal panel | `GET /api/admin/users`, `GET /api/admin/users/[id]/{detail,activity-summary,subtopics}`, `GET /api/admin/siswa/[id]/evolusi` |
| Riset | [admin/riset](../src/app/admin/riset/) with sub-pages `bukti/`, `kognitif/`, `prompt/`, `readiness/`, `triangulasi/` | RM2/RM3 research workbench: review evidence, cognitive scores, prompt classifications, field readiness, triangulation records | See section 4 |
| Ekspor | [admin/ekspor](../src/app/admin/ekspor/) | CSV/JSON export bundle. Experimental — not used in active thesis flow | `GET /api/admin/insights/export`, `GET /api/admin/research/export`, `GET /api/admin/users/export`, `GET /api/admin/activity/export` |
| Login / Register | [admin/login](../src/app/admin/login/), [admin/register](../src/app/admin/register/) | Admin auth pages | `POST /api/admin/login`, `POST /api/admin/register`, `POST /api/admin/logout`, `GET /api/admin/me` |

### Admin API surface (full map)

```text
src/app/api/admin/
  dashboard/        - KPI rollup
  insights/         - aggregate insights + export
  monitoring/logging/ - api_logs viewer (experimental)
  me, login, logout, register
  activity/         - 16 sub-endpoints (see table above)
  discussions/      - analytics + bulk + per-session (NOT IN ACTIVE USE)
  research/         - 14 sub-endpoints (see section 4)
  users/            - list, [id]/detail, [id]/activity-summary, [id]/subtopics, export
  siswa/[id]/evolusi - per-student longitudinal evolution
```

## 3. Common Admin Tasks

Each task lists the page, the click path, and the underlying endpoint hit by `apiFetch()`.

### 3.1 Inspect a single student's full activity

1. Open [admin/siswa](../src/app/admin/siswa/), click a row.
2. Detail page hits `GET /api/admin/users/[id]/detail` and `GET /api/admin/users/[id]/activity-summary`.
3. Click "Evolusi" tab to load `GET /api/admin/siswa/[id]/evolusi` (longitudinal across `learning_sessions`).

### 3.2 Browse activity by module

1. Open [admin/aktivitas](../src/app/admin/aktivitas/).
2. Switch tabs to call the matching `/api/admin/activity/*` endpoint.
3. Click a row to open a modal:
   - Reflection: `JournalModal` (component under [src/components/admin/](../src/components/admin/)) hits the row's reflection JSON returned inline.
   - Transcript: `TranscriptModal` shows ask-question + challenge text.
   - Quiz: shows `evaluated_answers` snapshot from `quiz_submissions.raw_evidence_snapshot`.

### 3.3 Search across activities

- Endpoint: `GET /api/admin/activity/search?q=...`
- The search is admin-scoped and joins to user + course for context.

### 3.4 Read the dashboard metrics

- Page calls `GET /api/admin/dashboard` and `GET /api/admin/insights`.
- Helpers live in [src/lib/admin-queries.ts](../src/lib/admin-queries.ts), [src/lib/admin-prompt-stage.ts](../src/lib/admin-prompt-stage.ts), [src/lib/admin-quiz-attempts.ts](../src/lib/admin-quiz-attempts.ts), [src/lib/admin-reflection-summary.ts](../src/lib/admin-reflection-summary.ts).

### 3.5 Inspect API logs

- Endpoint: `GET /api/admin/monitoring/logging` ([route](../src/app/api/admin/monitoring/logging/route.ts)).
- Reads from the `api_logs` table populated by [withApiLogging](../src/lib/api-logger.ts).
- Useful for finding silent failures (`label = 'cognitive-scoring-failed'`, `label = 'feedback-dual-write-failed'`, `label = 'ask-question-history-save-failed'`).
- This page is experimental and not part of the active thesis review routine.

### 3.6 Export data

- All export endpoints live under `/api/admin/*/export`.
- Marked experimental: not part of the active thesis pipeline. Prefer querying Supabase directly for thesis tables.

## 4. Research Pipeline (RM2 / RM3) Operations

The pipeline turns raw learner activity into coded research evidence usable for the thesis. It runs in five logical stages.

```text
        capture                 auto-classify           auto-score              auto-code            triangulate
[user activity rows] -----> [prompt_classifications] -> [auto_cognitive_scores] -> [research_evidence_items] -> [triangulation_records]
                                                                                                            |
                                                                                                            v
                                                                                                  [research_field_readiness]
```

### 4.1 Capture (synchronous, automatic)

Triggered on the user-facing write paths:

- `POST /api/ask-question` ([route](../src/app/api/ask-question/route.ts)) -> `ask_question_history` + classify via [prompt-classifier.ts](../src/services/prompt-classifier.ts) + sync evidence via [research-session.service.ts](../src/services/research-session.service.ts).
- `POST /api/quiz/submit` ([route](../src/app/api/quiz/submit/route.ts)) -> `quiz_submissions` + evidence sync + cognitive scoring after the response is sent (`after()`).
- `POST /api/jurnal/save` ([route](../src/app/api/jurnal/save/route.ts)) -> `jurnal` + mirror to `feedback` + evidence sync + cognitive scoring (`after()`).
- `POST /api/challenge-thinking` and `POST /api/challenge-response` -> `challenge_responses` + evidence sync.
- `POST /api/discussion/respond` -> `discussion_messages` + evidence sync (discussion module is experimental — see section 7).

Every capture call resolves a `learning_sessions` row via `resolveResearchLearningSession()` and writes a `data_collection_week` bucket so longitudinal queries work.

### 4.2 Auto-classify (synchronous)

- Heuristic classifier: [src/services/prompt-classifier.ts](../src/services/prompt-classifier.ts).
- Stages: `SCP -> SRP -> MQP -> REFLECTIVE`.
- Output: `prompt_classifications` rows + `prompt_stage` / `stage_confidence` / `micro_markers` columns on `ask_question_history`.

LLM-backed re-classification (admin only): `POST /api/admin/research/classify` ([route](../src/app/api/admin/research/classify/route.ts)) — calls `gpt-4o-mini` to suggest stage + rationale + micro-markers for a single prompt text.

### 4.3 Auto-score (deferred via `after()`)

- Service: [src/services/cognitive-scoring.service.ts](../src/services/cognitive-scoring.service.ts).
- Output: `auto_cognitive_scores` rows scoring 12 indicators (6 CT + 6 CTh).
- Triggered by the user-facing routes asynchronously so the response is not blocked.

### 4.4 Auto-code (manual trigger)

- Endpoint: `POST /api/admin/research/auto-code` ([route](../src/app/api/admin/research/auto-code/route.ts)).
- Service: [src/services/research-auto-coder.service.ts](../src/services/research-auto-coder.service.ts).
- Body fields: `user_id`, `course_id`, `learning_session_id`, `limit` (1..10, default 3), `runtime_budget_ms` (10000..25000, default 20000), `dry_run`, `include_reviewed`, `run_triangulation` (default true).
- Output: rows in `research_auto_coding_runs` + updates to `research_evidence_items.coding_status` and `triangulation_records`.
- `GET /api/admin/research/auto-code` returns recent run history.

### 4.5 Reconcile evidence (manual trigger)

- Endpoint: `POST /api/admin/research/reconcile` ([route](../src/app/api/admin/research/reconcile/route.ts)).
- Service: [src/services/research-data-reconciliation.service.ts](../src/services/research-data-reconciliation.service.ts).
- Body: `dry_run` (default true), `limit` (1..150, default 50), `user_id`, `course_id`.
- Backfills missing `learning_session_id` and `data_collection_week` on historical evidence rows.

### 4.6 Field readiness check

- Endpoint: `GET /api/admin/research/readiness` ([route](../src/app/api/admin/research/readiness/route.ts)).
- Service: [src/services/research-field-readiness.service.ts](../src/services/research-field-readiness.service.ts).
- Returns per-student readiness status: `siap_tesis`, `sebagian`, or `perlu_data` plus per-RM coverage.

### 4.7 Other research endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/research/analytics` | Aggregate counts per stage / indicator / week |
| `GET /api/admin/research/classifications` | List `prompt_classifications` (filter, paginate) |
| `GET /api/admin/research/auto-scores` and `.../summary` | Browse `auto_cognitive_scores` |
| `GET /api/admin/research/evidence` | Browse `research_evidence_items` |
| `GET /api/admin/research/triangulation` | Browse `triangulation_records` |
| `GET /api/admin/research/sessions` | Browse `learning_sessions` |
| `GET /api/admin/research/indicators` | Read `cognitive_indicators` seed |
| `GET /api/admin/research/artifacts` | Reserved — `research_artifacts` is empty |
| `POST /api/admin/research/bulk` | Bulk operations (review / mark) on evidence rows |
| `GET /api/admin/research/export` | CSV / JSON / SPSS-shaped export with anonymisation |

## 5. Pipeline Status (Honest Snapshot)

| Table | Current rows | Status |
|-------|--------------|--------|
| `prompt_classifications` | ~143 | Active, populated by classifier on every ask-question |
| `cognitive_indicators` | 12 | Seed (6 CT + 6 CTh), reference table |
| `auto_cognitive_scores` | ~12 | Active but thin — depends on `after()` scoring not failing |
| `research_evidence_items` | ~261 | Active, unified evidence ledger |
| `research_auto_coding_runs` | ~41 | Populated each time `auto-code` runs |
| `triangulation_records` | ~64 | Populated by auto-coder when `run_triangulation = true` |
| `discussion_assessments` | ~45 | Populated by `/api/discussion/respond` (module experimental) |
| `learning_sessions` | ~22 | Active longitudinal anchor |
| `research_artifacts` | 0 | Reserved, no writer yet |
| `prompt_revisions` | 0 | Reserved, no writer yet |
| `inter_rater_reliability` | 0 | Reserved, no writer yet |

Per the researcher's notes, the full RM2/RM3 classification pipeline is partial: capture and classify run automatically, but coding + triangulation must be triggered manually and several reserved tables are still empty.

## 6. Manual Interventions (Cheatsheet)

### Trigger an auto-coder run

```bash
curl -X POST $APP_URL/api/admin/research/auto-code \
  -H "Cookie: access_token=...; csrf_token=..." \
  -H "x-csrf-token: ..." \
  -H "Content-Type: application/json" \
  -d '{"limit": 5, "runtime_budget_ms": 20000, "dry_run": false, "run_triangulation": true}'
```

### Reconcile historical evidence

```bash
curl -X POST $APP_URL/api/admin/research/reconcile \
  -H "x-csrf-token: ..." -H "Content-Type: application/json" \
  -d '{"dry_run": true, "limit": 100}'
```

### Re-classify a single prompt (LLM)

```bash
curl -X POST $APP_URL/api/admin/research/classify \
  -H "x-csrf-token: ..." -H "Content-Type: application/json" \
  -d '{"prompt_text": "...", "context": "..."}'
```

### Export evidence

```bash
curl "$APP_URL/api/admin/research/export?format=csv&data_type=evidence&anonymize=true" \
  -H "Cookie: access_token=..."
```

## 7. Modules Not In Active Thesis Use

These exist in code but are intentionally skipped in the active research workflow. Do not invest fix-time in them unless explicitly scoped.

- **Discussion module** — `/api/discussion/*`, `/api/admin/discussions/*`, `discussion_sessions`, `discussion_messages`, `discussion_assessments`. Code path is intact; not part of the thesis instrument.
- **Ekspor admin** — [admin/ekspor](../src/app/admin/ekspor/) and `/api/admin/*/export` endpoints. Experimental.
- **Monitoring / logging UI** — `/api/admin/monitoring/logging`. Useful for triage; not on the thesis review checklist.

## 8. Database Admin Tasks (via Supabase)

Run these directly against the `adminDb` (service role) or via the Supabase SQL editor.

- Count active learners: `SELECT count(*) FROM users WHERE role IN ('USER','user') AND deleted_at IS NULL;`
- Count generated courses: `SELECT count(*) FROM courses WHERE deleted_at IS NULL;`
- Count quiz attempts: `SELECT count(DISTINCT quiz_attempt_id) FROM quiz_submissions;`
- Soft-delete a user: `UPDATE users SET deleted_at = now() WHERE id = '...' AND email NOT IN ('expantrixmedia@gmail.com','sal@expandly.id');`
- Investigate silent failures: `SELECT * FROM api_logs WHERE label LIKE '%failed%' ORDER BY created_at DESC LIMIT 50;`
- Re-seed cognitive indicators: re-run [docs/sql/](./sql/) seed file (see DATABASE_SCHEMA.md).
- Reset rate-limit hits: `DELETE FROM rate_limits WHERE expires_at < now();` ([rate-limit.ts](../src/lib/rate-limit.ts) cleans up periodically anyway).

## 9. Suggested Review Routine

1. Open dashboard, scan KPI tiles for anomalies.
2. Open aktivitas tab for the latest 24h, spot-check ask-question and reflection rows.
3. Run `GET /api/admin/research/readiness` to see per-student readiness.
4. If new evidence has accumulated, trigger `POST /api/admin/research/auto-code` (limit 3, dry-run first).
5. After auto-code, inspect `triangulation_records` via `/api/admin/research/triangulation`.
6. Sample one student in [admin/siswa/[id]](../src/app/admin/siswa/[id]/) and walk through their evolusi.
7. Check `api_logs` for `label = '%failed%'` weekly.

## 10. Data Interpretation Caveats

- Classifier output is heuristic; short prompts often land in `SCP` with low confidence.
- `auto_cognitive_scores` come from an LLM scorer; trends should be triangulated with manual review before being used as thesis evidence.
- The classifier and scorer prompts may drift across model upgrades; document the model version (`OPENAI_MODEL`) when exporting results.
- Use `CT` / `CTh` consistently in writeups. Older docs sometimes used `CPT` — do not propagate that label.

## 11. Reflection Rollout Operations (Legacy Helper)

- Live precheck: `node scripts/reflection-rollout-live.mjs`
- JSON output: `node scripts/reflection-rollout-live.mjs --json`
- `--apply-safe` requires a Management API token and a clean precheck (no rating/index drift).
- The `feedback.origin_jurnal_id` backfill is conservative — ambiguous pairs are left `NULL` for manual review. Uniqueness on `feedback.origin_jurnal_id` may be enforced once the duplicate scan is empty.
- The legacy `jurnal` unique constraint may be dropped once every read/write path uses the historical reflection model (see `/api/jurnal/save` for the current write path).
