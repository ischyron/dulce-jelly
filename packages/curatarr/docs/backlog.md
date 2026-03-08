# Scout Backlog And Radarr Parity (2026-03-07)

Status scale used in this doc:
- `Implemented`: usable and aligned for core user flow.
- `Partial`: works for some flows but has major gaps.
- `Prototype`: early behavior, not safe to trust for automation.
- `Missing`: not implemented.

## Radarr Parity (Major Chunks)

| Feature chunk | Radarr baseline | Curatarr current | Status | Code-grounded sample |
|---|---|---|---|---|
| Release search and fetch | Mature indexer search with downstream decision pipeline | Prowlarr search exists, but error handling falls back silently and quality of query strategy is heuristic | Partial | `fetchScoutReleases` has broad `catch {}` fall-through (`src/server/routes/scout.ts:681-734`) |
| Release scoring engine | Stable quality/profile/custom-format scoring | Title-regex scoring with fixed steps and hardcoded gates | Prototype | Pipeline always applies top-10% gate (`src/server/routes/scout.ts:815`, `src/server/routes/scout/scoring.ts:354-367`) |
| LLM tie-break/semantic checks | Not native in Radarr | UI/docs claim LLM filtering, but execution is disabled; separate single-candidate gate still drops results | Prototype | `applyLlmRuleset` no-op (`src/server/routes/scout/scoring.ts:343-352`) + single-candidate drop (`src/server/routes/scout/scoring.ts:370-381`) |
| Custom format flexibility | Multiple CF rules and composable score model | Hard limit of one custom CF override rule | Prototype | API rejects more than one `scout_custom_cf` rule (`src/server/routes/scout/rulesDomain.ts:79-81`), UI disables add after one (`src/ui/src/components/settings/scout/sections/CustomOverrides.tsx:212-220`) |
| Block rules / hard rejects | Robust restrictions and profile constraints | Blockers exist, but matching fields/options are inconsistently applied | Partial | `appliesTo` path resolves to same target both branches (`src/server/routes/scout/scoring.ts:318`) |
| Auto decision loop | Mature monitored/download/queue model | Auto scout exists but ranks candidates from ratings only and keeps cooldown in process memory | Prototype | Priority formula uses critic+IMDb only (`src/server/routes/scout.ts:848-872`), cooldown map in memory (`src/server/routes/scout.ts:41`, `src/server/routes/scout.ts:877-883`) |
| TRaSH/Recyclarr parity | Via Recyclarr + Radarr CF sync | Stores metadata/snapshot only; no real rule/score import | Missing | Sync response persists `scoutTrashSyncedRules: '0'` and returns `syncedRules: 0` (`src/server/routes/scout.ts:961-980`) |
| Settings truth and docs alignment | Consistent profile/CF concepts | Key naming and behavior are drifted between docs and implementation (`scoutCf*` vs `scoutPipeline*`) | Prototype | Docs still describe `scoutCf*` (`docs/scout-approach.md:18`, `docs/scoring-yaml.md:13-40`) while runtime uses `scoutPipeline*` (`src/server/routes/scout/scoring.ts:73-130`) |
| Test intent vs product intent | Regression tests for expected user outcomes | E2E validates prototype behavior (drop 90%, force one candidate) instead of validating correctness goals | Prototype | `test/scout.spec.cjs:233-325` |

## Backlog (Approach Issues + Code/Technical Issues)

| Category | Issue | End-user impact | Fix/design change | Code-grounded sample |
|---|---|---|---|---|
| Approach | Hardcoded percentile funnel (`top 10%`) before final recommendation | Good releases disappear unpredictably on large result sets | Replace fixed ratio with configurable confidence gate based on score spread and minimum quality thresholds | `applyTopPercentileGate(..., 0.1)` in search path (`src/server/routes/scout.ts:815`) |
| Approach | LLM step is marketed as active filter but is disabled | Users trust behavior that does not run; confidence in recommendations drops | Either enable provider-backed LLM evaluation end-to-end or hide LLM filtering claims and UI until active | No-op LLM ruleset execution (`src/server/routes/scout/scoring.ts:343-352`) vs claims in docs (`docs/scout-rules.md:4-7`) |
| Approach | Any enabled LLM rule forces single remaining candidate | False certainty; removes operator choice even for near-equal good releases | Remove hard single-candidate enforcement; return ranked shortlist with explicit confidence | `applyLlmSingleCandidateGate` drops all except one (`src/server/routes/scout/scoring.ts:370-381`) |
| Approach | Custom CF model limited to one rule | Cannot model real-world preferences (groups, codecs, sources, penalties) | Support ordered multi-rule CF overrides with deterministic merge semantics | Rule limit check (`src/server/routes/scout/rulesDomain.ts:79-81`) |
| Approach | Auto scout prioritization ignores upgrade delta and current file quality | Automation may process wrong titles first | Prioritize by expected upgrade gain: current quality deficit + candidate confidence + risk | Current priority uses only ratings (`src/server/routes/scout.ts:848-872`) |
| Approach | Auto Scout is not validated as an end-to-end background automation flow | Operators cannot trust scheduled behavior, cooldown correctness, or restart behavior | Add BDD scenarios for scheduled trigger, cooldown persistence, and safe no-op on missing config; gate releases with deterministic acceptance checks | Auto-run exists (`src/server/routes/scout.ts:892-940`) but coverage is mostly behavior-lock/prototype in `test/scout.spec.cjs` |
| Approach | TRaSH sync is metadata snapshot, not policy sync | Operators think parity exists while scoring remains custom/prototype | Implement true mapping import from TRaSH CF groups to Curatarr rule model, including diff/apply/report | `syncedRules: 0` response path (`src/server/routes/scout.ts:975`) |
| Approach | Product messaging vs behavior drift (docs/UI promise more than backend) | Confusing UX and wrong expectation of safety | Make docs and UI reflect current runtime status; expose explicit prototype warning in Scout settings/page | Docs claim active LLM filtering (`docs/scout-rules.md:4-7`) |
| Approach | Verify progress UX is weaker than Scan progress UX | Operators cannot monitor verify runs with the same confidence/detail as scan runs | Standardize long-running-job UX: use one shared progress modal pattern (SSE stream + counters + cancel + completion summary) across Scan, Sync, Verify | Scan uses dedicated progress modal (`src/ui/src/pages/Scan.tsx:211`, `src/ui/src/components/shared/modals/ScanProgressModal.tsx:40-225`) while Verify stays inline (`src/ui/src/pages/Verify.tsx:121-285`) |
| Approach | “Scan in background” is not explicitly validated as a user-visible contract | Users may assume background reliability while UI reconnect/refresh behavior is unproven | Define and test contract: scan continues after page navigation/refresh, status survives reconnect, history row is coherent at completion | Background execution + SSE exists (`src/server/routes/scan.ts:81-149`, `src/server/routes/scan.ts:163-199`) but no explicit BDD contract test |
| Code/Technical | `appliesTo` is effectively ignored in custom CF and blocker matching | Rule config appears richer than actual behavior | Implement true `title` vs `full` target contexts (e.g., title-only vs full raw payload text) | `rule.appliesTo === 'full' ? text : text` (`src/server/routes/scout/scoring.ts:244`, `src/server/routes/scout/scoring.ts:318`) |
| Code/Technical | Regex flags handling is inconsistent and lossy | Some user-entered regex rules behave unexpectedly | Normalize and preserve supported flags consistently across validation and runtime; reject invalid combos early | Blocker runtime keeps only `i` (`src/server/routes/scout/scoring.ts:322`) |
| Code/Technical | Process-memory state for cache/cooldown/auto status | Restart wipes state; automation behavior changes after deploy/restart | Move cooldown/cache/state to DB table with TTL cleanup and run-history records | In-memory maps/state (`src/server/routes/scout.ts:36-42`) |
| Code/Technical | Broad exception swallowing in search path | Debugging failures is hard; bad upstream behavior is hidden | Use typed error objects and structured logs per protocol/indexer/query form | Silent catches in release fetch (`src/server/routes/scout.ts:695-734`) |
| Code/Technical | Settings save hardcodes LLM provider to `openai` | User-configured provider cannot be respected cleanly | Keep provider editable or explicitly remove provider choice from model and docs | Forced assignment (`src/ui/src/pages/Settings.tsx:170`) |
| Code/Technical | Tests currently lock prototype behavior as expected output | Refactor toward proper design gets blocked by tests | Replace brittle behavior-lock tests with intent-based tests (quality confidence, deterministic explanations, safe fallback) | `test/scout.spec.cjs:233-325` |
| Code/Technical | Verify progress implementation is page-local and not reusable like Scan/Sync | Progress behavior diverges across jobs and is harder to maintain | Extract a reusable job-progress component/hook for verify and align event schema with shared modal contract | Verify manages SSE/progress inline (`src/ui/src/pages/Verify.tsx:54-120`, `src/ui/src/pages/Verify.tsx:207-285`) vs shared Scan modal (`src/ui/src/components/shared/modals/ScanProgressModal.tsx:40-127`) |
| Code/Technical | Scan History note text is ambiguous: `pruned X stale DB file rows` | Users cannot tell whether files were deleted from disk, DB-only cleanup, or scan failure side effect | Revise note format to explicit DB-only language and include context (e.g., `Removed X missing file records from DB under scanned root`) | Note is currently generated in scan orchestrator (`src/scanner/scan.ts:170-171`, `src/scanner/scan.ts:268`) |
| Code/Technical | Missing BDD test for scan-history note semantics | Regression risk: wording/function meaning drifts again | Add BDD-style route/db test covering incremental scan with stale DB rows and assert history note text + counts are coherent | Scan history rendered from `run.notes` (`src/ui/src/pages/Scan.tsx:61-70`) and persisted by `finishScanRun` (`src/db/client.ts:723-756`) |

## Requested BDD Cases (Analysis Only, Not Implemented)

| Feature | Given | When | Then |
|---|---|---|---|
| Auto Scout schedule safety | Scout automation is enabled with cooldown and valid Prowlarr config | Scheduler interval elapses twice | First run processes up to cap; second run respects cooldown and reports `skippedByCooldown` without reprocessing same titles |
| Scan runs in background | A scan is started from `/scan` | User navigates away or refreshes page during scan | Scan keeps running server-side; reconnect to `/api/scan/events` and `/api/scan/status` reflects active run until completion |
| Scan history stale-row note clarity | DB contains file rows under root that no longer exist on disk | Incremental scan finishes with no new ffprobe work but stale rows are pruned | History `notes` clearly states DB-record cleanup (not media deletion), with count and root context |

## Example Acceptance Samples For Follow-up Work

| Scenario sample | Current result | Expected after fixes |
|---|---|---|
| 50 releases returned for one movie, strong score cluster in top 8 | 45 dropped by percentile gate immediately | Keep adaptive shortlist (for example top 5-10) based on score distance/confidence |
| One LLM rule enabled for tie-break only | All but one candidate dropped by single-candidate gate | LLM may re-rank or annotate ties; does not force one-candidate output |
| Operator adds 3 custom CF overrides (group boost, WEBRip penalty, AV1 penalty) | API rejects after first rule | All rules saved and applied in deterministic order |
| Service restart after auto-scout run | Cooldown map cleared; same titles may run again immediately | Cooldown persists across restart from DB-backed state |
