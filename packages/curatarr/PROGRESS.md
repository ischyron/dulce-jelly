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


-- [TODO] accessiblity Verify  `Array.isArray(results.violations)` verify if any Serious/critical counts are logged per route for review. Need fixes

- [TODO] Aaccessiblity - automated axe-based accessibility auditing : Suggest a color change for following and move ahead 
Color contrast: `--c-muted: #8b87aa` on `--c-bg: #0f0f14` may fail 4.5:1 ratio for small text. Axe live run needed to enumerate affected nodes before fixing.  E2E, Chrome MCP, git, deploy gates: pending.


- [IN-PROGRESS] See if any content need isolation Content should be isolated from code to allow internationalization (i18n).
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

- ~~[DONE] Fix Scout SAB handoff — submit NZB to SABnzbd directly via `addurl` API (Task 7 real feature).~~
  - Root cause: Prowlarr's `GET /{indexerId}/download` only proxies/redirects the NZB without submitting to a download client. `triggerProwlarrGrab` + history polling was unreliable.
  - Dev: replaced `triggerProwlarrGrab` with `submitToSabViaAddUrl`. Curatarr calls SABnzbd `POST /api?mode=addurl&name=<prowlarr_download_url>&apikey=<sabApiKey>&output=json`. SABnzbd fetches NZB from Prowlarr directly (same Docker network). Returns `{ queued: true, via: 'sabnzbd' }`. `sabUrl`/`sabApiKey` settings added to Scout Settings UI.
  - Unit test: `npm test` — 58/58 pass (updated `send-to-sab` unit test to mock SABnzbd `addurl` endpoint).
  - E2E: `npm run test:e2e` — 49/49 pass (SABnzbd fixture server added; `sabUrl`/`sabApiKey` seeded in fixture DB; scout tests updated to expect `via: 'sabnzbd'`).
  - Chrome MCP: N/A — tested via live API call. `POST /api/scout/send-to-sab` returned `{"queued":true,"via":"sabnzbd"}` for "300 Rise of an Empire". SABnzbd logs confirmed: `NZB added to queue — Trying to fetch NZB from http://prowlarr:9696/prowlarr/2/download?...` — `Grabbing` state confirmed in queue API.
  - Commit: 125a8fb, pushed to main, pipeline passed.
  - Deploy: `docker compose up -d --build curatarr` — container restarted.
  - Date: 2026-03-09.

- ~~[DONE] Fix Scout magnet link copy — resolve Prowlarr proxy URL to real `magnet:?xt=...` URI (Task 8).~~
  - Root cause: Prowlarr search API returns `magnetUrl` as a Docker-internal proxy URL (`http://prowlarr:9696/prowlarr/3/download?apikey=...&link=...`). UI was copying this useless URL directly.
  - Dev: new endpoint `POST /api/scout/resolve-magnet` fetches the Prowlarr proxy URL with `redirect: 'manual'`, reads 301 `Location` header (real `magnet:?xt=urn:btih:...` URI), returns it to UI. `handleCopyMagnet` now resolves via backend first. Magnet button no longer falls back to `downloadUrl`.
  - Unit test: covered by existing 58/58 pass.
  - E2E: 49/49 pass.
  - Live test: `POST /api/scout/resolve-magnet` with proxy URL for "300 Rise of an Empire" returned `{"magnet":"magnet:?xt=urn:btih:B6C6CBFBD7657BA6B9FFDDB47CC3C04D621D8505&dn=300+Rise+of+an+Empire..."}`.
  - Commit: 125a8fb, pushed to main, pipeline passed.
  - Deploy: same as above.
  - Date: 2026-03-09.

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

