# Scout Feature Test Cases (Chrome MCP / Playwright)

Date: 2026-03-04
Scope: Scout Queue, Scout scoring (including CF/bitrate), Scout rules UI, Prowlarr integration, auto-scout safety guards.

## Environment
- Curatarr URL: `http://localhost:3270`
- Services: `curatarr`, `prowlarr`, `jellyfin` running in Docker
- Current state observed:
  - `/api/stats` healthy
  - `/api/candidates` returns records
  - `prowlarrUrl` + `prowlarrApiKey` currently empty in `/api/settings`

## Test Data Setup
- Ensure library has at least:
  - 1 legacy codec movie (`mpeg4` or `mpeg2video`)
  - 1 AV1 movie
  - 3+ 1080p candidate movies with ratings
- Optional for positive Scout search tests:
  - Configure Prowlarr URL/API key in Settings
  - Confirm at least one working indexer in Prowlarr

## Core Test Cases

1. Scout queue baseline load
- Steps:
  1. Open `/scout`
  2. Verify table renders rows and score column
- Expected:
  - Page heading `Scout Queue`
  - Candidate count shown
  - Rows include score, quality, flags, ratings

2. Legacy codec surfacing (MPEG-4 priority visibility)
- Steps:
  1. Open `/scout`
  2. Locate rows where codec is `mpeg4`/`mpeg2video`
  3. Compare list position vs similarly rated H264 rows
- Expected:
  - Legacy rows are visible within first pages/results (not buried)
  - Row shows legacy warning tag in `Flags`

3. Scout filters from Settings defaults
- Steps:
  1. Open `/settings`
  2. Set `Min MC`, `Min IMDb`, `Max Scout Resolution`
  3. Save
  4. Open `/scout` without query params
- Expected:
  - Scout uses saved defaults as initial filter state
  - Candidate total changes according to new thresholds

4. Manual batch selection limit (indexer safety cap)
- Steps:
  1. Open `/settings`; set `Scout Batch Size = 3`; save
  2. Open `/scout`
  3. Select 4 rows
- Expected:
  - UI blocks 4th selection
  - User sees max-batch error message

5. Batch confirm modal integrity
- Steps:
  1. Select 2-3 rows in `/scout`
  2. Click `Scout Batch`
- Expected:
  - Modal lists exact selected titles
  - Shows filename and full path
  - Confirm action starts batch call

6. Prowlarr not configured guard
- Steps:
  1. Keep Prowlarr fields empty
  2. In Movie drawer, click `Scout Releases`
  3. Call `/api/scout/auto-run`
- Expected:
  - API returns `422` + `prowlarr_not_configured`
  - UI shows clear actionable error, no crash

7. Prowlarr configured positive flow
- Steps:
  1. Set `prowlarrUrl` + `prowlarrApiKey` in Settings; save
  2. Open movie drawer from `/scout`
  3. Click `Scout Releases`
- Expected:
  - Ranked release list appears
  - `Most Efficient Path` summary appears
  - Recommended top release is shown

8. Interactive recommendation quality checks
- Steps:
  1. Run `Scout Releases` for 3 movies
  2. Inspect top-3 scoring reasons
- Expected:
  - Reasons include resolution/source/codec/penalties consistently
  - Obviously weak releases (legacy codec, too-small 4k) are penalized

9. Auto-scout manual trigger
- Steps:
  1. Enable auto-scout settings in `/settings`
  2. Click `Run Auto Scout Now`
  3. Inspect `/api/scout/auto-status`
- Expected:
  - Status toggles running → complete
  - Summary shows processed, cooldown-skipped, errors
  - Processed count never exceeds configured cap or hard max 10

10. Auto-scout cooldown behavior
- Steps:
  1. Run auto-scout once
  2. Run again immediately
- Expected:
  - Second run skips recently processed movies per cooldown
  - `skippedByCooldown` increases

11. Scout rules API integrity (scout category)
- Steps:
  1. GET `/api/rules?category=scout`
  2. Validate default rules
- Expected:
  - Contains at least:
    - `Upgrade priority targets`
    - `AV1 compatibility audit`
    - `MPEG4/legacy codec replacement`

12. Rules update persistence
- Steps:
  1. PUT `/api/rules` to toggle one scout rule `enabled`
  2. Re-fetch rules
- Expected:
  - Updated value persists after refresh
  - Rule priority/order remains deterministic

13. CF score + bitrate settings (when UI is implemented)
- Steps:
  1. In Settings, set CF weights and bitrate thresholds
  2. Save and run Scout search for same movie before/after
- Expected:
  - Ranking changes according to configured weights
  - Explanation reflects CF/bitrate factors

14. TRaSH sync action (when implemented)
- Steps:
  1. Trigger `Sync TRaSH/Recyclarr` from Settings
  2. Re-open rules/scoring section
- Expected:
  - Last sync timestamp updates
  - Imported patterns/rules visible
  - Existing custom overrides preserved

15. Error handling and resiliency
- Steps:
  1. Stop Prowlarr container
  2. Trigger Scout search and auto-run
- Expected:
  - API returns controlled `502`/typed error
  - UI shows non-blocking error state
  - No white-screen or frozen modal

## Quick API Assertions (Executed)
- `GET /api/candidates?minCritic=65&minCommunity=7&maxResolution=1080p&limit=5` returned 5 candidates.
- `GET /api/rules?category=scout` returned 3 seeded scout rules.
- `POST /api/scout/search-one` returned `422 prowlarr_not_configured` (expected in current config).
- `POST /api/scout/auto-run` returned `422 prowlarr_not_configured` (expected in current config).

## Playwright Smoke (Executed)
- Command: `npm run test:e2e` (in `packages/curatarr`)
- Result: `11 passed`.
