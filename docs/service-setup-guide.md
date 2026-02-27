# Service Setup Guide

Quick, one-time setup steps for each service after the stack is running. Start with the LAN ports below before switching to subdomains/Cloudflare.

## Ports & Internal Hostnames

| Service | Local Access | Internal Hostname |
|---------|--------------|-------------------|
| Jellyfin | `http://localhost:3278` | `jellyfin:8096` |
| Jellyseerr | `http://localhost:3277` | `jellyseerr:5055` |
| Prowlarr | `http://localhost:3276` | `prowlarr:9696` |
| qBittorrent | `http://localhost:3275` | `qbittorrent:8080` |
| SABnzbd | `http://localhost:3274` | `sabnzbd:8080` |
| Radarr | `http://localhost:3273` | `radarr:7878` |
| Sonarr | `http://localhost:3272` | `sonarr:8989` |
| FlareSolverr | n/a (internal service) | `flaresolverr:8191` |
| Huntarr | `http://localhost:3271` | `huntarr:9705` |

## Jellyfin
1) Open `http://localhost:3278` and create an admin account.
2) Add libraries pointing to the mounted media paths (e.g., `/Volumes/Movies`, `/Volumes/Series`).
3) Optional: generate an API key (Dashboard → Advanced → API Keys) for Radarr/Sonarr connections.

## Jellyseerr
1) Open `http://localhost:3277` (use direct port for first setup).
2) Select **Configure Jellyfin** and set host `http://jellyfin:8096` (no base URL).
3) Sign in with Jellyfin credentials; choose libraries to monitor.

## qBittorrent
1) Open `http://localhost:3275`; grab the temporary password from logs:
   `docker compose logs qbittorrent | grep "temporary password"`.
2) Log in, change credentials (Tools → Options → Web UI → Authentication).
3) Set default save path `/downloads/torrents`; optional incomplete path `/downloads/incomplete`.
4) Keep listening port 6881 TCP/UDP (already mapped).

## SABnzbd
1) Open `http://localhost:3274` and run the wizard.
2) Folders: Completed → `/downloads/usenet`; Incomplete → `/incomplete`.
3) Save the API key for Radarr/Sonarr if using Usenet.

## Prowlarr
1) Open `http://localhost:3276`.
2) Add indexers (Settings → Indexers).
3) Connect apps (Settings → Apps): Radarr `http://radarr:7878`, Sonarr `http://sonarr:8989`; use API keys from each app.
4) Optional (recommended for CF-protected indexers): add FlareSolverr under Settings → Indexer Proxies with host `http://flaresolverr:8191`.
5) Optional API automation: set `PROWLARR_API_KEY` in `.env`, then call `POST /prowlarr/api/v1/indexerProxy` with header `X-Api-Key: <PROWLARR_API_KEY>` and FlareSolverr schema from `GET /prowlarr/api/v1/indexerProxy/schema`.

## Radarr
1) Open `http://localhost:3273` and finish the wizard.
2) Root folder: `/movies` (binds to `JELLYFIN_MOVIES`).
3) Download clients: qBittorrent at `http://qbittorrent:8080` (path `/downloads/torrents`) and/or SABnzbd at `http://sabnzbd:8080` (path `/downloads/usenet`).
4) Quality profiles & custom formats: synced via Recyclarr (see Automation below); adjust to your preference if not using the defaults.
5) Optional: Connect Jellyfin at `http://jellyfin:8096` using a Jellyfin API key.

## Sonarr
1) Open `http://localhost:3272` and finish the wizard.
2) Root folder: `/series` (binds to `JELLYFIN_SERIES`).
3) Download clients: qBittorrent at `http://qbittorrent:8080` (path `/downloads/torrents`) and/or SABnzbd at `http://sabnzbd:8080` (path `/downloads/usenet`).
4) Quality profiles & custom formats: synced via Recyclarr; adjust if you have custom preferences.
5) Optional: Connect Jellyfin at `http://jellyfin:8096` using a Jellyfin API key.

## Huntarr
1) Open `http://localhost:3271` and complete setup.
2) Connect Huntarr to your Arr apps using internal URLs (for this stack): Sonarr `http://sonarr:8989`, Radarr `http://radarr:7878`, etc.
3) Add API keys from each app and tune hunt limits/intervals to avoid aggressive indexer usage.

## Automation (Recyclarr + Quality Broker)
- **Recyclarr**: Customize and copy `quality-broker/config/recyclarr.example.yml` into `data/recyclarr/config/recyclarr.yml`, then run `npm run ms sync` to sync quality profiles.
- **Radarr release profiles (YAML-driven)**: Edit `data/recyclarr/config/configs/radarr-release-profiles.yml` (sample at `packages/quality-broker/config/recyclarr-sample/radarr-release-profiles.yml`) and apply with `./bin/apply-radarr-release-profiles.sh`. This creates/updates Radarr release profiles idempotently (for example: block `WEBRip` and `HDTV`).
- **Quality Broker**: Customize and copy  `quality-broker/config/config.example.yaml` to `data/quality-broker/config/config.yaml`, add your Radarr and OpenAI API keys (config file only), run a build from repo root (`npm run build --prefix quality-broker`), then test with `npm run ms qb-run -- --batch-size 1`. Cron runs daily via the `quality-broker` service (configure `QUALITY_BROKER_CRON`, applied as `CRON_SCHEDULE`).
- **Run tests**: `node --test test/test-services.test.mjs` (requires `TEST_AUTH_USER` and `TEST_AUTH_PASS` environment variables).
