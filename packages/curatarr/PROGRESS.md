# Progress Tracker

### Ground rules
- Always read this PROGRESS.MD from disk before starting each task and before updating task status.
- Do not create new sections on this file; keep updates inline under existing items.
- Status lifecycle is strict: `TODO -> IN-PROGRESS -> DONE | BLOCKED`.
- `DONE` is allowed only when all workflow gates in `AGENTS.md` pass.
- If any required gate is missing, skipped, or failed, mark `BLOCKED` (or keep `IN-PROGRESS`).
- Do not close tasks with follow-up questions when required gates are incomplete.
- Strike through completed or blocked items and keep the final status label visible.
- Every item marked `DONE` must include inline evidence:
  - Dev summary
  - Unit/interaction test command and result
  - Playwright e2e command and result
  - Chrome MCP manual verification result (or explicit `N/A` reason)
  - Commit hash and push confirmation
  - Deploy command/result
  - Date

## TODO Items

- [DONE] ~~Reframe Verify as budgeted random-sampling deep check, add per-file budget control (30s-1h, localStorage), and fix clear-count accuracy to report completed results instead of pending reservations.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: verify runtime now uses budgeted random sampling (`30..3600s`) with stratified random windows and strict per-file budget timeout; `/api/verify/start` accepts `budgetSeconds`; Verify UI renamed to `Deep Check via Random Sampling`, includes budget input persisted in localStorage and reused for single-file recheck; clear API now returns `{ cleared, clearedPending, clearedTotal }` so user-facing `cleared` count reflects completed result rows (`pass/fail/error`) rather than chunked `pending` reservations
  - Unit/interaction: `npm run build && npm run test` -> pass (58/58)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: flow exercised: `http://dulce.local:3270/verify` after deploy; expected: new heading/description + budget control visible and bounded; actual: page shows `Deep Check via Random Sampling`, budget input present with min `30`, max `3600`, default `30`, and updated sampling guidance text; pass
  - Git: `2c61c80`, push ok (`main -> main`)
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok (container rebuilt/restarted)
  - Date: 2026-03-08

- [DONE] ~~Verify failures diagnostics UX: add expandable/copyable detailed errors + curated impact summary, and clear all verification states including pass rows.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: `/api/verify/clear` now resets all non-null verification states (`pass`/`fail`/`error`/`pending`) via `clearVerifyErrors`; Verify UI now includes a top-level clear button, per-row `Details` expansion with full raw diagnostics textarea, curated impact list (flag/error pattern mapping), and copy-to-clipboard with fallback for non-secure origins (`execCommand('copy')`)
  - Unit/interaction: `npm run build:server && npm run test` -> pass (58/58)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: flow exercised: `http://dulce.local:3270/verify` -> open failure row details, verify curated impact + raw diagnostics, click `Copy` (status: `Diagnostics copied to clipboard.`), click `Clear Verification Data`; expected: details visible/copyable and clear resets status counts including pass; actual: details panel rendered correctly, copy succeeded with confirmation, status cards changed to `Passed=0 Failed=0 Errors=0` and failures table disappeared; pass
  - Git: `f52b373`, push ok (`main -> main`)
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok; pre-push pipeline docker build+deploy -> ok
  - Date: 2026-03-08

- [DONE] ~~Deep verify queue ramps through batches until the user stops it (Cisco requested continuous runs).~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: `CuratDb.pickFilesForVerify`/`reserveVerifyFilesById` reserve batches as `pending`, `startVerifyQueue` now refills the worker queue with new chunks (chunk size 200) and only stops when no more work or `cancel`; queue workers emit `file_start` per file and keep pulling until signal abort, so the 3-worker job never idles after the first chunk
  - Unit/interaction: `npm run build:server && npm run test` -> pass (58/58)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: N/A (backend behavior only)
  - Git: `93046d8`, push ok (`main -> main`)
  - Deploy: pre-push pipeline `docker compose build curatarr` + `docker compose up -d curatarr` -> ok
  - Date: 2026-03-08

- [DONE] ~~Replace the full five-minute deep verify decode with the new quick-check pipeline that samples (<20 s) and only flags prioritized errors.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: `deepCheck` now limits `ffmpeg` to 20 seconds (`QUICK_CHECK_SECONDS`), enforces a 1-minute timeout and curates decode/mux regexes for actionable issues; removed GOP analysis to keep the operation fast; docs updated in `docs/technical/verify-diagnostic-classification.md`
  - Unit/interaction: `npm run build:server && npm run test` -> pass (58/58)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: N/A (backend change)
  - Git: `93046d8` (quick check committed together with queue change)
  - Deploy: pre-push pipeline `docker compose build curatarr` + `docker compose up -d curatarr` -> ok
  - Date: 2026-03-08

- [DONE] ~~Verify UX: add clear-errors action, add per-row recheck, disable recheck while verify is running, and block second-tab starts with explicit alert; tighten deep-verify diagnostics to actionable flags.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: added `POST /api/verify/clear` + DB reset helper for fail/error states; added Verify failures table actions (`Clear Errors`, row `Recheck`) with running-state disables; added 409 in-progress alert path for start/recheck across tabs/windows; tightened deep-check classifier to prioritize actionable decode/mux faults and ignore known null-mux noise; added diagnostic classification doc `docs/technical/verify-diagnostic-classification.md`
  - Unit/interaction: `npm run build:server && npm run test` -> pass (58/58)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: blocked in this session (all `mcp__chrome__*` calls timed out after interruption); fallback manual verification executed via Playwright script on deployed app: two-tab verify start race produced alert `"Deep Verify is already running in another tab/window. Wait for completion or stop the current run first."`; verify status confirmed single active run; run cancelled and status returned `running:false`; pass (fallback)
  - Git: `1a533d6`, push ok (`main -> main`)
  - Deploy: pre-push pipeline `docker compose build curatarr` + `docker compose up -d curatarr` -> ok
  - Date: 2026-03-08

- [DONE] ~~Deep verify start should display which files are actively started/running with live status updates on `/verify`.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: emitted `file_start` SSE events from verify workers; added `/verify` live `Running Now` list bound to active file starts/completions; added i18n strings for running/waiting states
  - Unit/interaction: `npm run test` -> pass (57/57)
  - E2E: `npm run test:e2e` -> pass (47/47)
  - Chrome MCP: flow exercised: `http://dulce.local:3270/verify` start + stop deep verify; expected: during run, UI shows live running filenames for started workers; actual: heading `RUNNING NOW (3)` appeared immediately with three active filenames and cleared after stop with `Cancelled.` status; pass
  - Git: `1886817`, push ok (`main -> main`)
  - Deploy: pre-push pipeline executed `docker compose build curatarr` + `docker compose up -d curatarr` -> ok
  - Date: 2026-03-08

- [DONE] ~~Polish Scout/Library filter-row layout: move Scout minimums after search, align reset button placement, and vertically center Library pagination/stats row content.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: moved Scout `Scout Minimums` widget directly after search; moved `Reset filters` to the Video/Audio row in both Scout and Library; aligned Library top-row stats/pagination (`Show`, count, total size) to be vertically centered; aligned shared wording (`Video`) and tag tone parity across Scout/Library
  - Unit/interaction: `npm test` -> pass (after `npm rebuild better-sqlite3` to fix local ABI mismatch)
  - E2E: `npm run test:e2e` -> pass (47 passed)
  - Chrome MCP: blocked in this session (`Transport closed` from `mcp__chrome__list_pages`); fallback manual verification run with Playwright on deployed app (`/library`, `/scout`) including screenshots `library-final-gate.png` and `scout-final-gate.png`; expected vs actual layout alignment matched; pass (fallback)
  - Git: `5717c33`, push ok (`main -> main`)
  - Deploy: pre-push pipeline `docker compose build curatarr` + `docker compose up -d curatarr` -> ok; post-check `docker compose ps curatarr` -> healthy
  - Date: 2026-03-08

- [DONE] ~~Refactor Scout/Library rating terminology and filter parity: remove MC naming, add Critic Score naming, and align Scout candidate filters/data parity with Library (no Scout sorting).~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: removed `MC/Metacritic/minMc` naming and replaced with `criticScore` naming (UI labels + i18n key + docs), updated Scout queue query params to `criticScoreMin` / `imdbScoreMin` (with backend compatibility aliases), added Scout pre-sorted queue info/link to Settings, expanded Scout filters to include Library-equivalent controls (search, resolution, codec, HDR/DV/AV1/legacy, audio format/layout, genres, tags, multi, noJf), aligned `/api/candidates` with Library-style filter semantics and primary-file parity, added release-group fallback parsing in candidates path, and added candidate parity/filter route tests.
  - Unit/interaction: `npm run build:server && npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (44 passed)
  - Chrome MCP: blocked in this session (`Transport closed` from `mcp__chrome__*` calls); manual browser verification executed via Playwright fallback on deployed app:  
    flow exercised: `/scout` and `/library?q=12%20Angry`; expected: Scout shows `Critic Score` and Library-equivalent filter controls with pre-sorted queue note; Library header shows `Critic Score`; release group parity for `12 Angry Men (1957)` between Scout and Library should match.  
    actual: Scout showed `Critic Score`, full filter set, and pre-sorted note linking to `/settings/scout`; Library header showed `Critic Score`; both views showed release group `YTS.MX` for `12 Angry Men (1957)`; pass (fallback).
  - Git: `1f48f19`, `48cabf3`, push ok (`main -> main`)
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok; plus pre-push pipeline docker build/deploy -> ok
  - Date: 2026-03-08

- [DONE] ~~Fix release-group parsing/display parity and remove hardcoded group-tier seeding/reporting heuristics.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: improved generic release-group extraction (bracketed/unbracketed/dotted/suffix cleanup), added `/api/movies` fallback parse from filename when `release_group` is missing, removed seeded `groups` rules and scout `targetGroups` defaults, removed `report.ts` hardcoded LQ group filtering and added TODO note for future DB-tag/TRaSH-backed classifier flow
  - Unit/interaction: `npm run build:server && npm test` -> pass
  - E2E: `npm run test:e2e` -> pass (44 passed) after rebuilding/deploying runtime
  - Chrome MCP: flow exercised: `http://127.0.0.1:3270/library?search=101.Dalmatians.II.Patchs.London.Adventure`; expected: file `101.Dalmatians.II.Patchs.London.Adventure.2003.720p.BRrip.x264.YIFY.mp4` shows group `YIFY`; actual: Library row `101 Dalmatians II- Patch's London Adventure (2003)` showed `YIFY` in Group column; pass
  - Git: `95c26c3`, push ok (`main -> main`)
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok (container recreated/started)
  - Date: 2026-03-08

-- [TODO] Verify  `Array.isArray(results.violations)` Serious/critical counts are logged per route for review. Need fixes

- [TODO] Automated axe-based accessibility auditing : Suggest a color change for following and move ahead 
Color contrast: `--c-muted: #8b87aa` on `--c-bg: #0f0f14` may fail 4.5:1 ratio for small text. Axe live run needed to enumerate affected nodes before fixing.  E2E, Chrome MCP, git, deploy gates: pending.


- [IN-PROGRESS] Content should be isolated from code to allow internationalization (i18n).
  - react-i18next is already in use with `common`, `scan`, `settings` namespaces.
  - Approach document created: `temp/i18n-approach.md` — covers namespace strategy, component audit, enforcement rules for AGENTS.md/CLAUDE.md, and phased implementation plan.

- [IN-PROGRESS] Harden Playwright e2e to be isolated, deterministic, and cleanup-safe (no live DB/data dependencies).
  - Plan: `temp/e2e-improvement-plan.md` (revised 2026-03-09)
  - Task 1 (isolated runtime harness): DONE (runner provisions temp DB/config/server and tears down regardless of pass/fail)
  - Task 2 (deterministic seed fixtures): DONE (5 synthetic movies seeded: 500 Days, First Man, Matrix, Legacy Sample, Multi Version)
  - Task 3 (fake Prowlarr fixture server): DONE (20 deterministic releases on random port; all scout e2e network-independent)
  - Task 4 (fake Jellyfin fixture strategy): DONE (jf-refresh disambiguation + jf-sync enrichment covered in jellyfin.spec.cjs)
  - Task 5 (cleanup/state restoration guardrails): DONE (smoke.spec.cjs CF save test wrapped in try/finally; all mutation tests now restore state)
  - Task 6 (flake hardening/assertion quality): DONE (replaced waitForSelector with expect().toBeVisible(); replaced networkidle with domcontentloaded + response wait; run time 17s→10s)
  - Task 7 (Prowlarr grab/history fixture + SAB flow e2e): DONE (fixture now handles /<num>/download + /api/v1/history with stateful grab tracking; mode=redirect path tests false-positive detection; two new scout tests pass: send-to-sab happy path + redirect unsubmitted path)

- [IN-PROGRESS] Scout scoring pipeline hardening (TRaSH alignment + configurable score ownership).
  - Constraint: keep strict stage boundaries (`basic` format heuristics must not embed remux-group/TRaSH policy).
  - Plan:
  - Stage 1 `basic`: only primitive format signals (resolution/video/audio/source/size-density).
  - Stage 2 `trash`: only TRaSH-rule matches and TRaSH-derived score values.
  - Stage 3 `custom`: local user overrides/extensions.
  - Data model target: persisted TRaSH catalog with `rule_key`, `label`, `default_score`, `source_revision`, `scored/unscored`.
  - Override target: per-rule local override map (`rule_key -> override_score`) with effective score resolution `override ?? default ?? 0`.
  - Explainability target: scoring reasons include stage + rule key + applied score + score source (`trash_default` / `local_override`).
  - Current action: revert ad-hoc remux-group boost from basic stage and design/implement the TRaSH override interface in later step.

- [IN-PROGRESS] Fix Scout SAB handoff false-positive queue status when Prowlarr only performs redirect grabs.
  - Root cause confirmed: Curatarr treated `GET /{indexerId}/download` HTTP 200 as success, while Prowlarr history showed `grabMethod=Redirect` (no download-client submission), resulting in `{"queued":true}` despite no SAB enqueue.
  - Dev update: `triggerProwlarrGrab` now verifies post-grab state through `/api/v1/history`; success requires a new `releaseGrabbed` event with `downloadClientName` present. Redirect/proxy-only grabs return `prowlarr_grab_unsubmitted:<method>`.
  - Validation update:
  - API check: `POST /api/scout/send-to-sab` now returns `502 {"error":"prowlarr_grab_failed","detail":"prowlarr_grab_unsubmitted:Redirect"}` for this failing path.
  - Chrome MCP check: on `http://dulce.local:3270/scout` -> open `12 Angry Men` detail -> `Scout Releases` -> click SAB button on recommendation.
  - Expected: no false success toast; explicit failure surfaced to user.
  - Actual: toast `SAB queue failed: prowlarr_grab_unsubmitted:Redirect` and detail line `Error: prowlarr_grab_unsubmitted:Redirect`; pass.
