# `scoring.yaml` Reference

Curatarr Scout CF scoring is defined in `packages/curatarr/config/scoring.yaml`.

- Source of truth: this YAML file.
- Runtime behavior: on Settings save, Curatarr syncs Scout CF settings into this file.
- DB relationship: DB values are still used by APIs/UI, but are synchronized with YAML.

## File shape

```yaml
scoutDefaults:
  scoutCfRes2160: 46
  scoutCfRes1080: 24
  scoutCfRes720: 8
  scoutCfSourceRemux: 30
  scoutCfSourceBluray: 20
  scoutCfSourceWebdl: 14
  scoutCfCodecHevc: 22
  scoutCfCodecAv1: 10
  scoutCfCodecH264: 8
  scoutCfAudioAtmos: 10
  scoutCfAudioTruehd: 8
  scoutCfAudioDts: 6
  scoutCfAudioDdp: 5
  scoutCfAudioAc3: 2
  scoutCfAudioAac: 1
  scoutCfLegacyPenalty: 40
  scoutCfSmall4kPenalty: 22
  scoutCfSmall4kMinGiB: 10
  scoutCfSeedersDivisor: 25
  scoutCfSeedersBonusCap: 10
  scoutCfUsenetBonus: 10
  scoutCfTorrentBonus: 0
```

## What each setting means

- `llm.provider`: fixed to `openai` right now.
- LLM provider source moved to `config/secrets.yaml` (`llm.provider`), with fallback to `openai`.

- `scoutCfRes2160`, `scoutCfRes1080`, `scoutCfRes720`: resolution weights.
- `scoutCfSourceRemux`, `scoutCfSourceBluray`, `scoutCfSourceWebdl`: source quality weights.
- `scoutCfCodecHevc`, `scoutCfCodecAv1`, `scoutCfCodecH264`: video codec weights.
- `scoutCfAudioAtmos`, `scoutCfAudioTruehd`, `scoutCfAudioDts`, `scoutCfAudioDdp`, `scoutCfAudioAc3`, `scoutCfAudioAac`: audio weights.
- `scoutCfLegacyPenalty`: subtracts score for legacy video codecs (xvid/mpeg4/mpeg2).
- `scoutCfSmall4kPenalty`: subtracts score when a 2160p release is suspiciously small.
- `scoutCfSmall4kMinGiB`: size threshold used by small-4K penalty.
- `scoutCfSeedersDivisor`: seeder bonus divisor (`floor(seeders / divisor)`).
- `scoutCfSeedersBonusCap`: max seeder bonus after divisor calculation.
- `scoutCfUsenetBonus`: fixed protocol bonus for usenet results.
- `scoutCfTorrentBonus`: fixed protocol bonus for torrent results.

## Effective score model

`score = resolution + source + codec + audio + protocol + seederBonus - penalties`

Where:
- `seederBonus = min(floor(seeders / scoutCfSeedersDivisor), scoutCfSeedersBonusCap)`
- penalties include legacy codec and suspiciously-small 4K.
