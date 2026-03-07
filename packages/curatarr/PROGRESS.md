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

- [TODO] ~~Full accessibility (A11y) support is needed across all UI widgets. Ensure the UI is tested for accessibility compliance.~~  
  Automated axe-based accessibility auditing is now added (`test/a11y.spec.cjs`), but full UI compliance need to be chaoved thoughexisting app-wide contrast and form-label violations across widgets.

- [TODO] ~~Content should be isolated from code to allow internationalization (i18n).  
    Content labels locally scoped to component folders can be useful.  
    Adopt a framework that supports both localization at the component level and a shared content space for common terms.  
    Choose a popular i18n tool suitable for large-scale open source projects with multi-language support—do not create a custom solution or reinvent existing approaches over community practices.  
    Create a thorough approach document in `temp/` and complete implementation after review.~~

- [TODO] Setting > General and Settings > Seperation heirachy is not visually clear in Side panel. Settings is sleft open. Ideally user opens settings as it would hacve "Setttings >" and 2 Settigns section  sub menu appears "General" and "Scout" 

- [DONE] ~~Refactor Scout rule ownership + remove pseudo-LLM hardcoded parsing and deprecated settings cleanup.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Added Scout-owned rules domain module and endpoints (`/api/scout/rules`, `/api/scout/rules/replace-category`), moved Scout UI/tests to new endpoints, blocked Scout categories in generic `/api/rules`, removed deprecated Scout settings cleanup from `settings.ts`, removed dead Scout rules UI section/state, removed legacy `scout` category from Scout cache revision hash, and disabled hardcoded sentence parsing in `applyLlmRuleset` (Step 5 execution path now non-heuristic until real provider-backed LLM integration).
  - Unit/interaction: `npm run test` -> pass; `npm run typecheck` -> pass
  - E2E: `npm run test:e2e` -> pass (44 passed)
  - Chrome MCP: `/settings/scout` verified custom CF create/save via new Scout rules route path and success badge; temporary rule cleaned up via API (`scout_custom_cf` reset to empty) -> pass
  - Git: `63586d6`, `9d61b4c`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-07

- [DONE] ~~Decompose `src/server/routes/scout.ts` into semantic modules and remove dead duplicate helpers.~~
  Evidence:
  - MCP preflight: `codex mcp list` -> pass; playwright=enabled; chrome=enabled
  - Dev: Extracted Scout cache logic into `src/server/routes/scout/cache.ts`, scoring/rule gates into `src/server/routes/scout/scoring.ts`, shared Scout route types into `src/server/routes/scout/types.ts`, rewired `scout.ts` to use extracted modules, and removed redundant in-file implementations (score config resolver, basic format scorer, cache revision/key/prune/meta helpers, duplicated rule type block).
  - Unit/interaction: `npm run typecheck` -> pass; `npm run test` -> pass
  - E2E: `npm run test:e2e` -> pass (44 passed)
  - Chrome MCP: Manually loaded `http://localhost:3270/settings/scout` and verified Scout Quality Funnel sections + settings widgets render correctly after refactor -> pass
  - Git: `1441aa9`, `aab5235`, push ok
  - Deploy: `cd ../../ && docker compose up -d --build curatarr` -> ok
  - Date: 2026-03-07
