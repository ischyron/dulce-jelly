# Service Setup Guide

Authoritative steps to configure each service after the stack is running. Use direct LAN ports for initial setup; subdomains/Cloudflare come afterward.

## Ports & Internal Hostnames
- Jellyfin: `http://localhost:3278` (internal: `jellyfin:8096`)
- Jellyseerr: `http://localhost:3277` (internal: `jellyseerr:5055`)
- Prowlarr: `http://localhost:3276` (internal: `prowlarr:9696`)
- qBittorrent: `http://localhost:3275` (internal: `qbittorrent:8080`)
- SABnzbd: `http://localhost:3274` (internal: `sabnzbd:8080`)
- Radarr: `http://localhost:3273` (internal: `radarr:7878`)
- Sonarr: `http://localhost:3272` (internal: `sonarr:8989`)

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

## Radarr
1) Open `http://localhost:3273` and finish the wizard.
2) Root folder: `/movies` (binds to `JELLYFIN_MOVIES`).
3) Download client: qBittorrent at `http://qbittorrent:8080` with path `/downloads`.
4) Quality profiles & custom formats: synced via Recyclarr (see Automation below).
5) Optional: Connect Jellyfin at `http://jellyfin:8096` using a Jellyfin API key.

## Sonarr
1) Open `http://localhost:3272` and finish the wizard.
2) Root folder: `/series` (binds to `JELLYFIN_SERIES`).
3) Download client: qBittorrent at `http://qbittorrent:8080` with path `/downloads`.
4) Quality profiles & custom formats: synced via Recyclarr.
5) Optional: Connect Jellyfin at `http://jellyfin:8096` using a Jellyfin API key.

## Automation (Recyclarr + Quality Broker)
- Recyclarr: merge the sample `quality-broker/config/recyclarr.example.yml` into `data/recyclarr/config/recyclarr.yml`, then run `ms sync`.
- Quality Broker: copy `quality-broker/config/config.example.yaml` to `data/quality-broker/config/config.yaml`, set Radarr/OpenAI keys, run `npm run setup` (from ``), then dry-run: `node quality-broker/dist/index.js run --batch-size 1`.
- Tests: `cd media-server && node --test test/test-services.test.mjs` (set `TEST_AUTH_USER/TEST_AUTH_PASS`).
