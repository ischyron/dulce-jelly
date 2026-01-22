# Recyclarr Sample Configs

Modular Recyclarr configuration examples for Radarr and Sonarr.

## Directory Structure

When deployed, the config structure should be:

```
data/recyclarr/config/
├── recyclarr.yml          # Main scaffold (auto-loaded)
├── secrets.yml            # API keys - MUST be here, not in configs/
├── settings.yml           # Recyclarr behavior settings
├── configs/               # Split service configs (auto-loaded)
│   ├── radarr.yml
│   └── sonarr.yml
├── includes/              # Shared include files (sibling to configs/)
│   ├── radarr-quality-profiles.yml
│   └── sonarr-quality-profiles.yml
└── cache/                 # Internal (managed by Recyclarr)
```

**Important (Recyclarr v8.0+):** The `includes/` directory must be a **sibling** of `configs/`, not inside it.

## Setup

1. Copy `secrets.example.yml` to `data/recyclarr/config/secrets.yml`
2. Edit secrets with your actual API keys
3. Copy `recyclarr.yml` to `data/recyclarr/config/recyclarr.yml`
4. Copy `radarr.yml` to `data/recyclarr/config/configs/radarr.yml`
5. Copy `sonarr.yml` to `data/recyclarr/config/configs/sonarr.yml`
6. Copy `includes/*.yml` to `data/recyclarr/config/includes/` (sibling to configs/)

## File Organization

| File | Purpose |
|------|---------|
| `radarr.yml` | Quality definitions + Custom Formats (Radarr-specific TRaSH IDs) |
| `sonarr.yml` | Quality definitions + Custom Formats (Sonarr-specific TRaSH IDs) |
| `includes/radarr-quality-profiles.yml` | Quality profiles (AutoAssignQuality, HD, Efficient-4K, HighQuality-4K) |
| `includes/sonarr-quality-profiles.yml` | Quality profiles with Sonarr-specific quality names |

## Key Points

- **Secrets location**: `secrets.yml` MUST be at `config/secrets.yml`, NOT in `configs/`
- **Auto-loading**: Files in `configs/` are auto-loaded; includes need explicit reference
- **Include paths**: Use `../includes/filename.yml` from configs (relative path)
- **Instance nesting**: Each service config needs proper nesting:
  ```yaml
  radarr:           # Top-level service key
    radarr_main:    # Instance name (user-defined)
      include:
        - config: ../includes/radarr-quality-profiles.yml
      base_url: !secret radarr_url
      api_key: !secret radarr_api_key
      # ... rest of config
  ```
- **Secret references**: Use `!secret key_name` to reference secrets

## Quality Profiles

All profiles use the same thresholds across Radarr and Sonarr:

| Profile | min_format_score | min_upgrade_format_score | until_score |
|---------|-----------------|-------------------------|-------------|
| AutoAssignQuality | - | - | - (no upgrades) |
| HD | 15 | 35 | 60 |
| Efficient-4K | 25 | 45 | 70 |
| HighQuality-4K | 20 | 40 | 80 |

## Documentation

- [Recyclarr Config Examples](https://recyclarr.dev/reference/config-examples/)
- [Recyclarr Config Reference](https://recyclarr.dev/wiki/yaml/config-reference/)
- [Recyclarr v8.0 Upgrade Guide](https://recyclarr.dev/wiki/upgrade-guide/v8.0/#include-dir)
