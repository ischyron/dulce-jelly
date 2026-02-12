# Quality Profile Configuration

This setup builds on the [TRaSH Guides](https://trash-guides.info/) — the authoritative resource for Radarr/Sonarr quality configuration. This document only covers **deviations** from TRaSH defaults.

## TRaSH Guide References

- [Radarr Quality Settings](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/)
- [Radarr Custom Formats](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/)
- [Sonarr Quality Settings](https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles/)
- [Sonarr Custom Formats](https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/)
- [Recyclarr](https://recyclarr.dev/) — syncs TRaSH configs to *arr apps

---

## Deviations from TRaSH Guide

| Aspect | TRaSH Default | Our Config | Rationale |
|--------|---------------|------------|-----------|
| **LQ penalty** | -10000 (hard reject) | -10/-15 | Allows YTS/compact groups when premium unavailable |
| **Streaming services** | 0 (identification only) | +12 to +35 (tiered) | Scores provenance; ATVP highest, then AMZN/NF tier |
| **Quality definitions** | TRaSH defaults | Custom MB/min limits | 15-20GB budget for 4K; tighter 1080p caps |
| **Remux** | Allowed (scored) | Blocked (size + CF -1000) | Storage efficiency; no 40GB+ files |
| **HDTV** | Allowed | Blocked (size caps) | Prefer WEB sources for modern content |

---

## Custom Quality Definitions (MB per minute)

Values: **min / preferred / max**.

### Blocked Qualities
```yaml
HDTV-720p:    { min: 0, preferred: 1, max: 1 }  # Deterministic reject
HDTV-1080p:   { min: 0, preferred: 1, max: 1 }
HDTV-2160p:   { min: 0, preferred: 1, max: 1 }
Remux-1080p:  { min: 0, preferred: 1, max: 1 }
Remux-2160p:  { min: 0, preferred: 1, max: 1 }
```

### 720p (fallback)
| Quality | Min | Pref | Max | ~Max Size (2hr) |
|---------|-----|------|-----|-----------------|
| WEBRip-720p | 5 | 10 | 20 | 2.4 GB |
| WEBDL-720p | 6 | 12 | 22 | 2.6 GB |
| Bluray-720p | 10 | 18 | 32 | 3.8 GB |

### 1080p
| Quality | Min | Pref | Max | ~Max Size (2hr) |
|---------|-----|------|-----|-----------------|
| WEBRip-1080p | 8 | 22 | 45 | 5.4 GB |
| WEBDL-1080p | 12 | 40 | 80 | 9.6 GB |
| Bluray-1080p | 18 | 40 | 75 | 9.0 GB |

### 2160p / 4K
| Quality | Min | Pref | Max | ~Max Size (2hr) |
|---------|-----|------|-----|-----------------|
| WEBRip-2160p | 20 | 55 | 110 | 13.2 GB |
| WEBDL-2160p | 25 | 85 | 170 | 20.4 GB |
| Bluray-2160p | 45 | 100 | 170 | 20.4 GB |

---

## Custom CF Scoring

### Streaming Services (TRaSH uses 0)

| Tier | Services | HD | Efficient-4K | HighQuality-4K |
|------|----------|----|--------------| ---------------|
| 1 | ATVP (Apple TV+) | +25 | +30 | +35 |
| 2 | AMZN, NF, DSNP, HMAX | +18 | +22 | +25 |
| 3 | PMTP, PCOK, Hulu, etc. | +12 | +15 | +18 |

### LQ Penalties (TRaSH uses -10000)

| CF | HD | Efficient-4K | HighQuality-4K |
|----|----|--------------| ---------------|
| LQ | -10 | 0 | -15 |
| LQ (Release Title) | -10 | 0 | -15 |

### Remux Penalty (TRaSH uses positive scores)

All Remux tiers scored **-1000** as safety net (also blocked by size caps).

---

## Profile Thresholds

Upgrades controlled by `until_quality` + `min_upgrade_format_score`. The upgrade score floor (2500) ensures only TRaSH-tiered release groups trigger upgrades — untiered P2P groups max out at ~2250 (DD+ 1750 + HDR 500) and are blocked.

| Profile | until_quality | min_format_score | min_upgrade_format_score |
|---------|---------------|------------------|--------------------------|
| AutoAssignQuality | — (no upgrades) | — | — |
| DontUpgrade | Bluray-2160p | — | — (upgrades disabled) |
| HD | Bluray-1080p | 0 | 2500 |
| Efficient-4K | WEBDL-2160p | 0 | 2500 |
| HighQuality-4K | Bluray-2160p | 0 | 2500 |

Size limits are enforced by quality definitions (MB/min), not profile thresholds.

---

## Quality Broker Integration

The Quality Broker automatically assigns movies to profiles based on critic ratings, popularity, and visual genre signals. See [Quality Broker](./quality-broker.md) for details.

---

## Config Files

```
data/recyclarr/config/
├── configs/
│   ├── radarr.yml          # Quality defs + CFs
│   └── sonarr.yml          # Quality defs + CFs
└── includes/               # Sibling to configs/ (Recyclarr v8.0+)
    ├── radarr-quality-profiles.yml
    └── sonarr-quality-profiles.yml
```

Sample configs: `packages/quality-broker/config/recyclarr-sample/`
