# Scout Approach: CF Scoring, Rules, TRaSH Sync

This document defines Curatarr's current Scout behavior and how operators should tune it.

## Goals

- Keep Scout deterministic and explainable.
- Prioritize real quality upgrades over noisy keyword matches.
- Preserve compatibility with common playback clients.
- Stay aligned with TRaSH guidance while keeping Curatarr opinionated.

## Scoring Model (CF-Style)

Scout release ranking uses additive scoring:

`score = resolution + source + codec + protocol + seeders - penalties`

Configurable settings are stored under `scoutCf*` in Settings.
Canonical config lives in `config/scoring.yaml` and is synchronized when Settings are saved.

Key penalties:
- Legacy codec penalty (xvid/mpeg4).
- Small-4K penalty below a configurable minimum GiB threshold.

## Rules Layer

The `scout` rule category is the behavioral layer on top of raw CF scoring.

Baseline rules include:
- Avoid quality downgrade.
- Prefer WEB-DL over WEBRip at the same resolution tier.
- Prefer verified groups in close-score ties.
- Prefer lower playback-risk in close-score ties.
- Prefer DD+/EAC3 over DTS-HD MA in close-score ties.

Rules are editable in Settings under **CF Scoring, Rules, Scout**:
- Toggle enabled/disabled.
- Change priority.
- Edit JSON config.

## LLM-Assisted Rule Refinement

Curatarr provides an LLM refinement draft generator:

- Input an objective (example: "favor Android TV compatibility").
- Curatarr returns:
  - an LLM-ready prompt with current scoring + rules,
  - a deterministic suggestion patch for common intents.
- Apply suggested settings/rule toggles, then save.

This keeps refinement auditable and avoids hidden rule changes.

## TRaSH Sync Strategy

Curatarr includes **Sync TRaSH Scores** in Settings:

- Applies a TRaSH-aligned Scout CF baseline (`scoutCf*` settings).
- Ensures Scout rule baseline is present.
- Stores sync metadata (`source`, `revision`, `syncedAt`) in settings.

Current implementation syncs Curatarr's opinionated baseline and records the latest TRaSH Guides revision when available.

## Recyclarr Relationship

Curatarr does not require Recyclarr for Scout to function.
If your stack already uses Recyclarr/Radarr CF policies, Curatarr's Scout scoring should be treated as a focused, Scout-only layer optimized for upgrade decisioning.

## Operational Workflow

1. Configure Prowlarr and Scout defaults.
2. Run **Sync TRaSH Scores** after significant policy updates.
3. Tune CF weights for your client/storage constraints.
4. Adjust Scout rules in Settings and save.
5. Use LLM refinement draft for goal-specific tuning.
6. Validate outcomes in Scout Queue and auto-scout summaries.
