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
└── cache/                 # Internal (managed by Recyclarr)
```

## Setup

1. Copy `secrets.example.yml` to `data/recyclarr/config/secrets.yml`
2. Edit secrets with your actual API keys
3. Copy `recyclarr.yml` to `data/recyclarr/config/recyclarr.yml`
4. Copy `radarr.yml` to `data/recyclarr/config/configs/radarr.yml`
5. Copy `sonarr.yml` to `data/recyclarr/config/configs/sonarr.yml`

## Key Points

- **Secrets location**: `secrets.yml` MUST be at `config/secrets.yml`, NOT in `configs/`
- **Auto-loading**: Files in `configs/` are auto-loaded; no includes needed
- **Instance nesting**: Each service config needs proper nesting:
  ```yaml
  radarr:           # Top-level service key
    radarr_main:    # Instance name (user-defined)
      base_url: !secret radarr_url
      api_key: !secret radarr_api_key
      # ... rest of config
  ```
- **Secret references**: Use `!secret key_name` to reference secrets

## Documentation

- [Recyclarr Config Examples](https://recyclarr.dev/reference/config-examples/)
- [Recyclarr Config Reference](https://recyclarr.dev/wiki/yaml/config-reference/)
