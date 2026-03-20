# Movies Wanted

`packages/movies-wanted` is the consolidated, resumable pipeline for:

- finding worthy missing movies
- estimating storage impact
- keeping accepted English and foreign candidate lists current

The target is still a storage estimate within roughly `+/- 1 TB`, but the workspace is now organized as a package instead of a temp folder.

## Layout

- `data/`
  - durable review artifacts and inputs
  - `criteria.json`
  - `blacklist.csv`
  - `raw_candidates.csv`
  - `seed_sources.csv`
  - `accepted_candidates.csv`
  - `english-accepted-candidates.csv`
  - `foreign-accepted-candidates.csv`
  - `owned_titles.csv`
  - `owned_titles.json`
- `cache/`
  - reusable lookup caches
  - `lookup_cache.json`
  - `accepted_language_cache.json`
  - `foreign_review_count_cache.json`
- `state/`
  - resumable processing state
  - `candidates.jsonl`
- `reports/`
  - rollups like `summary.json`
- `logs/`
  - runtime failures like `failures.log`
- `src/commands/`
  - focused command modules
- `src/cli.mjs`
  - unified command entrypoint

## Commands

Run through the root helper:

```sh
npm run movies:wanted -- <command>
```

Or directly:

```sh
node --env-file=.env packages/movies-wanted/src/cli.mjs <command>
```

Available commands:

- `init`
- `export-owned`
- `import-seeds`
- `queue`
- `verify-batch [size]`
- `run [batchSize] [delaySeconds] [maxBatches]`
- `reconcile-owned`
- `apply-blacklist`
- `refresh-exports`
- `review-counts`
- `add-to-radarr [bucket] [minYear] [snapshotPath]`
- `refresh`
- `update`

## Recommended flow

Full resumable refresh:

```sh
node --env-file=.env packages/movies-wanted/src/cli.mjs update
```

That performs:

1. `export-owned`
2. `import-seeds`
3. `queue`
4. `run`
5. `reconcile-owned`
6. `apply-blacklist`
7. `refresh-exports`
8. `review-counts`

Faster maintenance when sources are already queued:

```sh
node --env-file=.env packages/movies-wanted/src/cli.mjs refresh
```

Add newly accepted titles to Radarr and trigger search:

```sh
node --env-file=.env packages/movies-wanted/src/cli.mjs add-to-radarr english 1990 packages/movies-wanted/cache/pre_hunt_accepted_keys.json
```

That example adds only post-1989 English titles that were accepted after the saved snapshot.

## Classification rules

The same acceptance rules are enforced as the movie recommendation skill:

- `1960-1989` English: `RT >= 85`
- `1960-1989` non-English: `RT >= 92`
- `1990+` English: `RT >= 80`
- `1990+` non-English: `RT >= 90`
- penalize `2000-2019` `Drama`, `Thriller`, `Action`, and `Comedy`
- exclude documentary, animation, history, music, musical, film noir, short films, and pre-1960 movies

`english-accepted-candidates.csv` and `foreign-accepted-candidates.csv` are split using Radarr lookup `originalLanguage` when available.

All accepted CSVs also carry `added_to_radarr` so review can distinguish "worth adding" from "already queued in Radarr".

`foreign-accepted-candidates.csv` also carries `rt_review_count` so low-review festival titles can be manually screened.

## Resume rules

- Never delete `state/candidates.jsonl` unless you intentionally reset the workspace.
- Candidate keys are durable `normalized_title|year`.
- Ownership matching prefers provider IDs:
  - `tmdbId`
  - `imdbId`
  - then normalized `title|year`
