# Scout Rules & LLM Filtering (2026-03-05)

## What users need to know
- The Scout pipeline ranks releases in this order: minimum qualifiers → TRaSH CF scores → custom CF overrides → **LLM ruleset filter** → final pick.
- The “Extended release filter LLM ruleset” (Settings → Scout) is a ordered list of natural-language rules. Top rule runs first; disabled rules are skipped.
- The LLM ruleset is only applied to releases already passing deterministic CF checks. It will drop weak candidates or boost ties with reasoning.
- You can drag to reorder, enable/disable, and save. A sample disabled set is available via “Add Disabled Examples.”
- The LLM provider is selected in Settings → Scout → LLM Provider; keys are stored in `settings.llmProvider` and `settings.llmApiKey` (or `config/secrets.yaml`).
- API endpoints affected:
  - `POST /api/scout/search-one` and `POST /api/scout/search-batch`
  - `POST /api/scout/rules/refine-draft` (draft a prompt from your objective)
  - UI pages `/scout` and `/settings` display the ruleset and the reasoning for dropped releases.

## Technical notes
- Config source of truth lives in `config/scoring.yaml` and mirrors `settings` DB rows. Saving Settings writes both.
- LLM rules are stored under `quality_rules` with `category = 'scout_llm_ruleset'` (see `src/server/routes/rules.ts`).
- Execution happens in `src/server/routes/scout.ts`: after CF scoring, releases are scored/filtered by the ordered ruleset; the prompt is assembled from the saved sentences plus objective.
- The client surfaces the rules in `ExtendedLlmRuleset` (Settings) and displays drop reasons in Scout Queue modals.
- Limits: batch size for scout searches is clamped (server-side) to 10; LLM ruleset length is effectively bounded by payload size (< 10 KB after serialization).
- Error handling: if the LLM call fails, Scout falls back to deterministic CF ordering and returns a warning banner to the UI.
