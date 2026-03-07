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
