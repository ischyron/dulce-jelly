# Quality Broker

Deterministic-first Radarr quality profile assigner that batches movies and tags decisions. Decisions are score-based from YAML weights; LLM is only used for ambiguous cases when enabled.

Start here:
- End-user profile intent and behavior: [Quality Profile](./quality-profile.md)
- Setup + automation steps: [Service Setup Guide → Automation](./service-setup-guide.md#automation-recyclarr--quality-broker)

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
- `reviseQualityForProfile`: optional Radarr profile name to re-evaluate all movies already in that profile
- `decisionProfiles`: target profiles the broker can pick from (must exist in Radarr/Recyclarr)
- `llmRequestDelayMs`: delay before LLM calls to avoid 429s on large queues (default 1200; set 0 to disable)
- `radarr.apiKey` (config only); URL auto-derives from `LAN_HOSTNAME` + `RADARR_PORT` (or `http://radarr:7878` in Docker). Override via `radarr.url` only if you need a custom host. Ensure the container shares the `media_net` network (defined as external in compose).
- `openai.apiKey` (required only if LLM fallback is enabled), `openai.model` (default gpt-4.1)
- `policyForAmbiguousCases.useLLM` (default true)
- `policyForAmbiguousCases.noLLMFallbackProfile` (default AutoAssignQuality)
- `promptHints`: natural-language heuristics to steer choices
- `reasonTags`: allowed demand reasons → tags (short human-readable labels, e.g., crit, pop, vis, weak)
- `rulesEngine.weights`: score inputs (critic/popularity/visual)
- `rulesEngine.visualWeights` + `rulesEngine.visualScoreConfig`: visual score weights + thresholds
- `rulesEngine.scoreThresholds`: score tiers for Efficient-4K / HighQuality-4K
- `rulesEngine.ambiguity`: defines when a case is considered ambiguous (LLM gate)
- `rulesEngine.rules`: minimal YAML rule table (priority-ordered) that selects the target profile
  
Popularity signals:
- `computedPopularityIndex` is derived from vote counts (log-scaled 0-100) and is preferred over raw TMDB popularity when present.

Environment fallbacks: `QUALITY_BROKER_CONFIG` (override config path).
Log checkpointing: `QUALITY_BROKER_LOG_FLUSH_EVERY` (entries, default 10) and `QUALITY_BROKER_LOG_FLUSH_INTERVAL_MS`
(milliseconds, default 15000) to keep JSON array logs updated during long runs.

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

Cron-safe: each run processes at most `batchSize`, prioritizing movies with the `autoAssignProfile` (or `reviseQualityForProfile` if set).

## Behavior
- Reads Radarr quality profiles dynamically; refuses to run if target profiles are missing.
- Computes a weighted score from critic/popularity/visual signals, then evaluates a minimal YAML rule table via json-rules-engine.
- Invokes the LLM only for ambiguous cases when enabled.
- If the LLM errors, the movie is left unchanged and the run log records the error.
- Applies Radarr quality profile and short reason tags (e.g., `crit`, `pop`, `vis`, `weak`).
- Writes per-run log JSON and updates `status/last-run.json` with counts and timestamp.

## Rules configuration (short example)
Define weights + score tiers, then a short rules table:

```yaml
rulesEngine:
  weights:
    criticHighBoost: 10
    popularityStrong: 3
    visualRich: 2
    visualScorePerPoint: 0.5
  visualWeights:
    Action: 3
    Sci-Fi: 2
  visualScoreConfig:
    maxScore: 6
    richMin: 3
    lowMax: 1
  scoreThresholds:
    efficient4k: 3
    high4k: 7
  rules:
    - name: score_high
      priority: 800
      conditions:
        all:
          - fact: decisionScoreTier
            operator: equal
            value: high
      event:
        type: decision
        params:
          profile: HighQuality-4K
```

Rule `name` appears in logs as `rulesApplied`. Short Radarr tags are derived from the signals that contributed to the score.

## Testing & Linting
- Type-check/build: `npm run build`
- Lint: `npm run lint`
- Basic config smoke: `npm test` (loads config only)

## Notes
- Jellyseerr integration is intentionally omitted (future enhancement).
- Credentials are never hardcoded; use env or mounted config.
