# Candidate Source Plan

Populate `raw_candidates.csv` from broad, recall-oriented lists before any RT verification.

## Goal

Get enough candidate coverage to keep final storage error within about `+/- 1 TB`.

At current storage baselines, that means candidate coverage should be good enough that the final accepted count is not off by more than roughly `65-75` movies.

## Low-token source order

1. Canon lists first
   - broad “best films” lists
   - decade lists
   - director filmography completion lists
   - major award winners and nominees

2. International prestige lists
   - non-English canon
   - festival winners
   - country-specific all-time lists

3. Stop only after the accepted count stabilizes
   - if adding a new source produces very few new accepted titles, the estimate is converging

## Recommended batch strategy

- import one source at a time into `raw_candidates.csv`
- run `queue-candidates.mjs`
- run `verify-rt-batch.mjs` in small batches
- check `reports/summary.json`
- repeat

This keeps every run resumable and avoids expensive all-at-once verification.

## Suggested source tags for `raw_candidates.csv`

- `canon_all_time`
- `canon_decade_1960s`
- `canon_decade_1970s`
- `canon_decade_1980s`
- `canon_decade_1990s`
- `international_prestige`
- `awards_best_picture`
- `awards_foreign_language`
- `director_completion`

## CSV guidance

Use this schema:

```csv
title,year,source_list,source_url,notes
```

Keep each row to one title-year pair. Do not pre-filter by RT at this stage.

## Stop condition

You are near convergence when:

- the latest source import yields mostly `owned` or `rejected` rows
- accepted additions per new source become small
- storage estimate changes by less than about `0.3-0.5 TB` across consecutive source batches
