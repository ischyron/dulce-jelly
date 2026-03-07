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

- [TODO] Verify if A11y is run with 2e2 and reports are created.
- [TODO]  Automated axe-based accessibility auditing is  added (`test/a11y.spec.cjs`), but full UI compliance need to be chaoved thoughexisting app-wide contrast and form-label violations across widgets.
- [TODO] Setting > General and Settings > Seperation heirachy is not visually clear in Side panel. Settings is sleft open. Ideally user opens settings as it would hacve "Setttings >" and 2 Settigns section  sub menu appears "General" and "Scout" 
- [TODO] Content should be isolated from code to allow internationalization (i18n).  
    Content labels locally scoped to component folders can be useful.  
    Adopt a framework that supports both localization at the component level and a shared content space for common terms.  
    Choose a popular i18n tool suitable for large-scale open source projects with multi-language support—do not create a custom solution or reinvent existing approaches over community practices.  
    Need to see how evey agent run can enforce cotent and code seperation popose edits to agents.md and claude.md
    Create a thorough approach document in `temp/` and complete implementation after review.