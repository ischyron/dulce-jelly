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

- [DONE] ~~Rebuild Scout rule baselines and migration reset (delete duplicated LLM/custom rows and replace with curated examples).~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Added schema v9 one-time reset for `scout_llm_ruleset` + `scout_custom_cf`, replaced LLM baseline with 2 curated disabled examples from release-scout skill intent, seeded single custom CF baseline, reduced Scout deterministic baseline set, preserved vertical numbered step visuals.
  - Unit/interaction: `npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (43 passed)
  - Chrome MCP: `/settings/scout` verified vertical connected Quality Funnel 1→6 and manual custom CF flow create/save->disable/save->delete/save -> pass
  - Git: `05fb2d5`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-05

- [DONE] ~~Implement Curatarr-native declarative TRaSH CF sync (Recyclarr-style mapping model, Radarr only parity reference).~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Added declarative TRaSH model module (`trashDeclarativeModel.ts`), rewired Scout sync to apply declarative mappings/settings, persisted model metadata (`modelVersion`, `mappingRevision`, `appliedCount`, setting changes, mapping snapshot), kept Radarr parity optional/reference.
  - Unit/interaction: `npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (43 passed)
  - Chrome MCP: `/settings/scout` advanced sync metadata visibility verified through updated read-only sync details payload/UI rendering path -> pass
  - Git: `05fb2d5`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-05

- [DONE] ~~Fix Scout custom/LLM rule save idempotency and extend e2e + Chrome MCP validation with create/toggle/delete cleanup flows.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Added `/api/rules/replace-category` and category delete helper, switched Scout custom/blocker/LLM saves to replace-category idempotent writes, enforced single custom CF override, updated e2e lifecycle coverage for create/disable/delete with cleanup and UI save-success assertion.
  - Unit/interaction: `npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (43 passed)
  - Chrome MCP: `/settings/scout` manual exploratory flow confirmed custom CF create/save success badge, toggle enabled/disabled, and delete cleanup -> pass
  - Git: `05fb2d5`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-05

- [DONE] ~~Rewrite Scout feature into Scout Quality Pipeline (full UI + backend rewrite).~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Replaced Scout settings and scoring flow with 6-step Scout Quality Pipeline, new `scoutPipeline*` settings schema, Step 2 generic bitrate-alignment scoring, Step 4 blocker rules + feature toggle, Step 5 LLM tie/weak thresholds, Step 6 manual/auto decision controls, updated API/types/tests.
  - Unit/interaction: `npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (42 passed)
  - Chrome MCP: `/settings/scout` flow verified; expected vs actual: 6 numbered pipeline stages visible with controls, Step 6 frequency fields hidden when automation disabled and shown when enabled -> pass
  - Git: `5e63086`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-05

- [TODO] ~~Full accessibility (A11y) support is needed across all UI widgets. Ensure the UI is tested for accessibility compliance.~~  
  Automated axe-based accessibility auditing is now added (`test/a11y.spec.cjs`), but full UI compliance need to be chaoved thoughexisting app-wide contrast and form-label violations across widgets.

- [TODO] ~~Content should be isolated from code to allow internationalization (i18n).  
    Content labels locally scoped to component folders can be useful.  
    Adopt a framework that supports both localization at the component level and a shared content space for common terms.  
    Choose a popular i18n tool suitable for large-scale open source projects with multi-language support—do not create a custom solution or reinvent existing approaches over community practices.  
    Create a thorough approach document in `temp/` and complete implementation after review.~~

- [TODO] Setting > General and Settings > Seperation heirachy is not visually clear in Side panel. Settings is sleft open. Ideally user opens settings as it would hacve "Setttings >" and 2 Settigns section  sub menu appears "General" and "Scout" 

- [IN-PROGRESS] Add e2e/Chrome MCP memory hygiene guardrails (prevent multi-GB growth via teardown + artifact pruning).
