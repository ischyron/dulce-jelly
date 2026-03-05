# Scout Settings and Scoring

## Pipeline
Scout ranking follows this order:

0. Scout Minimum Qualifiers
1. TRaSH Guide CF scoring
2. Custom CF Scores / Overrides + Release Blockers (coming soon)
3. Final LLM Rule set (drops weak candidates + tie-break scoring on close results)
4. Final choice

## Scout Minimum Qualifiers
Located at the top of `Settings > Scout`.

- `Min MC (Metacritic)`
- `Min IMDb`
- `Scout Batch Size`

These qualifiers gate what appears in the Scout Queue listing view.

## Deterministic scoring
CF scoring is deterministic and configurable in Settings:

- Resolution
- Source
- Video codec
- Audio
- Bitrate gates
- Protocol and seeder weighting

TRaSH sync can refresh baseline values and stores read-only sync snapshots.

## Extended release filter LLM ruleset
This stage is above deterministic CF scoring.

- Generates a draft prompt and suggested rule toggles
- Intended to drop weak candidates from large result sets
- Applies tie-break scoring when deterministic scores are close

## Notes
- `Max Resolution` is no longer part of Scout minimum qualifiers.
- Scout Queue defaults to no resolution cap unless a max-resolution query param is explicitly used.
