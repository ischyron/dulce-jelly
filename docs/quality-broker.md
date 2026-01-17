# Quality Broker

LLM-guided Radarr quality profile assigner that batches movies, tags decisions, and keeps remux blocked. Runs inside the media-server stack as a Dockerized CLI similar to Recyclarr.

## Paths
- Code: `quality-broker/`
- Config (mounted state): `data/quality-broker/config/config.yaml`
- Logs: `data/quality-broker/logs/*.json`
- Status: `data/quality-broker/status/last-run.json`

## Configuration
Copy the example and fill in values (prefer env expansion):

```bash
cp quality-broker/config/config.example.yaml \
   data/quality-broker/config/config.yaml
```

> Note: The provided examples are opinionated toward efficiency-first WEB tiers and keep remux blocked by default. Power users or quality purists can raise limits or allow remux in their own Recyclarr/Radarr setup—ensure changes stay consistent between Recyclarr profiles and broker targets.

Key fields (see comments in example):
- `batchSize` (default 10; CLI `--batch-size` overrides)
- `autoAssignProfile`: Radarr profile name used as the intake queue
- `decisionProfiles`: target profiles the LLM can pick from (must exist in Radarr/Recyclarr)
- `radarr.apiKey` (config only); URL auto-derives from `LAN_HOSTNAME` + `RADARR_PORT` (or `http://radarr:7878` in Docker). Override via `radarr.url` only if you need a custom host. Ensure the container shares the `media_net` network (defined as external in compose).
- `openai.apiKey` (required in config only), `openai.model` (default gpt-4-turbo)
- `promptHints`: natural-language heuristics to steer choices
- `remuxPenalty`: reminder that remux stays blocked (score -1000, 1MB/min cap)
- `reasonTags`: allowed demand reasons → tags `demand-<reason>` (e.g., popular, criticScore, visual, lowq)

Environment fallbacks: `QUALITY_BROKER_CONFIG` (override config path).

## Running

From host:

```bash
cd quality-broker
npm install
npm run build
node dist/index.js run --batch-size 5
```

From container (after building image):

```bash
docker exec quality-broker run --batch-size=5
```

Scheduled via compose (defaults to midnight daily):

```bash
docker compose up -d quality-broker
# adjust schedule via QUALITY_BROKER_CRON (sets CRON_SCHEDULE inside container, default "0 0 * * *")
```

Via docker compose + ms CLI (service is profile-gated and runs on demand):

```bash
# run a batch (appends args to the CLI)
ms qb-run -- --batch-size 5

# view latest log
ms qb-log
```

Cron-safe: each run processes at most `batchSize`, prioritizing movies with the `autoAssignProfile` or missing any `decision:` tag.

## Behavior
- Reads Radarr quality profiles dynamically; refuses to run if target profiles are missing.
- Fetches candidate movies, asks GPT-4 Turbo for the best profile using supplied heuristics and metadata (ratings, popularity, media info, filename).
- Applies Radarr quality profile and tags: `decision:<ProfileName>` plus `rule:<RuleName>` returned by the LLM.
- Writes per-run log JSON and updates `status/last-run.json` with counts and timestamp.
- Keeps remux blocked; prompt reiterates the -1000 score and 1MB/min cap.

## Testing & Linting
- Type-check/build: `npm run build`
- Lint: `npm run lint`
- Basic config smoke: `npm test` (loads config only)

## Notes
- Jellyseerr integration is intentionally omitted (future enhancement).
- Credentials are never hardcoded; use env or mounted config.
