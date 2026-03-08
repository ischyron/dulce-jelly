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
- Good defaults (copy/paste into the UI to start):
  1. "Reject CAM/TS/TELESYNC/HDTS/HDTC/WORKPRINT or any non–studio master sources."
  2. "Prefer REMUX > WEB-DL > WEBRip > HDTV. Reject Re-Encodes claiming REMUX where bitrate < 12 Mbps for 1080p or < 35 Mbps for UHD."
  3. "Reject rips missing English audio OR with Atmos flagged but channels < 6."
  4. "Reject dubbed/voice-over only tracks (e.g., RU, PL lector) unless English present."
  5. "Flag and deprioritize SDR versions when HDR10 or Dolby Vision is available from the same group."

## Technical notes
- Config source of truth lives in `config/scoring.yaml` and mirrors `settings` DB rows. Saving Settings writes both.
- LLM rules are stored under `quality_rules` with `category = 'scout_llm_ruleset'` (see `src/server/routes/rules.ts`).
- Execution happens in `src/server/routes/scout.ts`: after CF scoring, releases are scored/filtered by the ordered ruleset; the prompt is assembled from the saved sentences plus objective.
- The client surfaces the rules in `ExtendedLlmRuleset` (Settings) and displays drop reasons in Scout Queue modals.
- For Scout custom CF/blocker rules, `appliesTo: "title"` evaluates only the release title; `appliesTo: "full"` evaluates a deterministic concatenation of title + indexer + guid + download URL + publish date + protocol + size/seed/peer fields.
- Regex flags for Scout custom CF/blocker rules are normalized to supported JavaScript flags (`gimsuy`) and applied consistently at validation and runtime.
- Limits: batch size for scout searches is clamped (server-side) to 10; LLM ruleset length is effectively bounded by payload size (< 10 KB after serialization).
- Error handling: if the LLM call fails, Scout falls back to deterministic CF ordering and returns a warning banner to the UI.
- Prompt assembly (high level):
  - Context: movie title/year, release list with CF metadata (bitrate, codecs, size, source, tags), and user objective (from Settings).
  - Rules: serialized as an ordered bullet list; disabled rules are omitted.
  - Expected output: JSON with `{ keep: boolean, reason: string }` per release; parser is strict and will drop unparsable entries.
- Failure modes worth alerting:
  - If the LLM response is malformed, Scout logs `llm_rules_parse_failed` and keeps deterministic ordering.
  - If payload exceeds model token limit, Scout truncates the candidate list before calling the LLM.
  - Network/401 errors bubble a warning; downloads are never auto-triggered on LLM errors.
- QA hooks:
  - `POST /api/scout/rules/refine-draft` can be hit in CI with canned objectives to ensure prompt structure stays stable.
  - Use Playwright e2e `scout.spec.cjs` to snapshot the displayed drop reasons; update baselines if rules change intentionally.
  - For unit-like checks without LLM cost, seed `test/results/scout` fixtures and run `npm run test:e2e` with `SCOUT_SKIP_LLM=1` to exercise the deterministic path.
