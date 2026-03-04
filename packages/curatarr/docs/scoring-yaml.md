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
  scoutCfBitrateMin2160Mbps: 10
  scoutCfBitrateMax2160Mbps: 35
  scoutCfBitrateMin1080Mbps: 4
  scoutCfBitrateMax1080Mbps: 15
  scoutCfBitrateMin720Mbps: 2.5
  scoutCfBitrateMax720Mbps: 8
  scoutCfBitrateMinOtherMbps: 1
  scoutCfBitrateMaxOtherMbps: 12
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
- `scoutCfBitrateMin2160Mbps`, `scoutCfBitrateMax2160Mbps`: 2160p bitrate gate band.
- `scoutCfBitrateMin1080Mbps`, `scoutCfBitrateMax1080Mbps`: 1080p bitrate gate band.
- `scoutCfBitrateMin720Mbps`, `scoutCfBitrateMax720Mbps`: 720p bitrate gate band.
- `scoutCfBitrateMinOtherMbps`, `scoutCfBitrateMaxOtherMbps`: fallback band for other resolutions.
- `scoutCfSeedersDivisor`: seeder bonus divisor (`floor(seeders / divisor)`).
- `scoutCfSeedersBonusCap`: max seeder bonus after divisor calculation.
- `scoutCfUsenetBonus`: fixed protocol bonus for usenet results.
- `scoutCfTorrentBonus`: fixed protocol bonus for torrent results.

## Effective score model

`score = resolution + source + codec + audio + protocol + seederBonus - penalties`

Where:
- `seederBonus = min(floor(seeders / scoutCfSeedersDivisor), scoutCfSeedersBonusCap)`
- bitrate gate excludes releases outside per-resolution bands.
