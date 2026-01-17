# DulceJelly Architecture

This document provides technical details about the DulceJelly media server architecture, networking, security model, and operational considerations.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Request Flow](#request-flow)
- [Network Architecture](#network-architecture)
- [Security Model](#security-model)
- [Infrastructure as Code](#infrastructure-as-code)
- [Service Details](#service-details)
- [File Structure](#file-structure)
- [Operational Notes](#operational-notes)
- [Troubleshooting](#troubleshooting)

## High-Level Architecture

DulceJelly is a Docker-based media server stack that provides:

1. **Media Streaming**: Jellyfin for watching content on any device
2. **Content Discovery**: Jellyseerr for requesting new content
3. **Automation**: Radarr (movies) and Sonarr (TV shows) for automatic content management
4. **Download Management**: qBittorrent (torrents) and SABnzbd (Usenet)
5. **Indexer Management**: Prowlarr for configuring content sources
6. **Quality Control**: Recyclarr for maintaining quality profiles

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet Users                           │
│                    (TV Clients, Web Browsers)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS (TLS Terminated)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    Cloudflare Edge Network                       │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────────────┐ │
│  │ DNS Records  │  │ WAF Rules  │  │ Optional: Access Policy │ │
│  │ (Pulumi IaC) │  │ Rate Limit │  │ (Admin apps only)       │ │
│  └──────────────┘  └────────────┘  └─────────────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Encrypted Tunnel
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    Home Network / Mac mini                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  cloudflared (Cloudflare Tunnel Agent)                   │  │
│  │  - Ingress rules (local YAML config)                     │  │
│  │  - Maps hostnames → http://caddy:80                      │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │  Caddy Reverse Proxy                                     │  │
│  │  - HTTP routing by hostname                              │  │
│  │  - Optional basic auth (admin apps)                      │  │
│  │  - Header forwarding (X-Forwarded-*, Host)               │  │
│  └───┬───┬───┬───┬───┬───┬───┬──────────────────────────────┘  │
│      │   │   │   │   │   │   │                                  │
│  ┌───▼───▼───▼───▼───▼───▼───▼──────────────────────────────┐  │
│  │              Docker Network: media_net                    │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │ Jellyfin │ │Jellyseerr│ │  Radarr  │ │  Sonarr  │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │qBittorrent│ │ Prowlarr │ │ SABnzbd  │ │Recyclarr │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Storage:                                                        │
│  - /Volumes/MEDIA1/Movies (library)                             │
│  - /Volumes/MEDIA1/Series (library)                             │
│  - /Volumes/MoviesSSD1/New/sab/* (incomplete downloads, SSD)    │
│  - data/* (app state, config, caches)              │
└──────────────────────────────────────────────────────────────────┘
```

## Request Flow

### Public Access via Cloudflare Tunnel

```
1. User requests https://jellyfin.mymedialibrary.example
   ↓
2. Cloudflare DNS resolves to Cloudflare edge
   ↓
3. Cloudflare WAF/Rate Limiting checks request
   ↓
4. [Optional] Cloudflare Access checks authentication (admin apps only)
   ↓
5. Request forwarded through encrypted tunnel to cloudflared
   ↓
6. cloudflared routes to http://caddy:80 based on hostname (local ingress rules)
   ↓
7. Caddy routes to appropriate service based on Host header
   ↓
8. [Optional] Caddy basic auth check (if configured)
   ↓
9. Caddy forwards to service container (e.g., jellyfin:8096)
   ↓
10. Service responds
```

### LAN Access (Direct)

```
1. User on LAN requests http://<server-ip>:3278
   ↓
2. Request goes directly to host port (no tunnel, no Caddy)
   ↓
3. Docker port mapping forwards to container
   ↓
4. Service responds
```

**Important**: LAN access bypasses all Cloudflare security layers and Caddy auth. This is intentional for local convenience.

## Network Architecture

### Docker Network

All services run in a single Docker bridge network: `media_net`

- **Service-to-service communication**: Use container hostnames
  - Example: Radarr → `http://qbittorrent:8080`
- **Benefits**:
  - Services can communicate without exposing ports to host
  - DNS resolution built-in
  - Network isolation from host

### Port Mappings

Services are exposed to the host on sequential ports:

| Service     | Host Port | Container Port | Protocol | Notes                      |
|-------------|-----------|----------------|----------|----------------------------|
| Caddy       | 80        | 80             | HTTP     | Reverse proxy              |
| Caddy       | 443       | 443            | HTTPS    | TLS (not currently used)   |
| Jellyfin    | 3278      | 8096           | HTTP     | Media streaming            |
| Jellyfin    | 3279      | 8920           | HTTPS    | TLS (not currently used)   |
| Jellyseerr  | 3277      | 5055           | HTTP     | Content requests           |
| Prowlarr    | 3276      | 9696           | HTTP     | Indexer management         |
| qBittorrent | 3275      | 8080           | HTTP     | WebUI (localhost only)     |
| qBittorrent | 6881      | 6881           | TCP/UDP  | Peer connections           |
| SABnzbd     | 3274      | 8080           | HTTP     | Usenet downloader          |
| Radarr      | 3273      | 7878           | HTTP     | Movie management           |
| Sonarr      | 3272      | 8989           | HTTP     | TV show management         |

**Design notes**:
- Ports are sequential for easy memorization
- qBittorrent WebUI bound to `127.0.0.1` only for security
- Peer port (6881) exposed for torrent functionality
- TLS ports (443, 3279, 8920) available but not currently used (TLS handled by Cloudflare)

### Hostname Resolution

#### Public Access

All public hostnames are subdomains of `mymedialibrary.example` (configurable):

- `jellyfin.mymedialibrary.example` → Jellyfin
- `jellyseerr.mymedialibrary.example` → Jellyseerr
- `radarr.mymedialibrary.example` → Radarr
- `sonarr.mymedialibrary.example` → Sonarr
- `qb.mymedialibrary.example` → qBittorrent
- `prowlarr.mymedialibrary.example` → Prowlarr
- `sab.mymedialibrary.example` → SABnzbd
- `mymedialibrary.example` → Landing page

DNS records point to `<tunnel-id>.cfargotunnel.com` (CNAME, proxied).

#### LAN Access

Two options:

1. **Direct IP:port**: `http://<server-ip>:3278` (most reliable)
2. **mDNS (optional)**: `http://media.local:3278` (if mDNS/Bonjour enabled)

The path-based routing on `media.local` (e.g., `/jellyfin`) is **deprecated** due to app-specific quirks with URL rewriting.

## Security Model

DulceJelly uses a layered security approach:

### Layer 1: Cloudflare Edge

Managed by Pulumi IaC (`infra/cloudflare/`):

1. **DNS with Proxy**
   - All DNS records are proxied (orange cloud)
   - Hides origin server IP
   - DDoS protection

2. **WAF (Web Application Firewall)**
   - Blocks suspicious bots (except verified crawlers)
   - Blocks common exploit scanners (sqlmap, nikto, etc.)
   - Optional: geo-restriction
   - Cloudflare managed ruleset (OWASP protection)

3. **Rate Limiting**
   - Protects Jellyfin auth endpoint: `/Users/authenticatebyname`
   - Max 10 requests/minute per IP
   - 5-minute timeout on violation
   - **Does NOT rate limit streaming** (`/Videos/*` paths excluded)

4. **HTTPS Enforcement**
   - All `http://` requests redirected to `https://` (308 Permanent Redirect)
   - Enforced at Cloudflare edge

5. **Optional: Cloudflare Access (Zero Trust)**
   - Can be enabled for admin services only
   - **Never applied to Jellyfin** (TV clients can't handle OAuth flows)
   - Supports multiple IdPs (Google, GitHub, SAML, etc.)
   - Policy-based access control

### Layer 2: Cloudflare Tunnel

- **Encrypted tunnel**: No port forwarding required
- **No inbound firewall rules**: All traffic is outbound from tunnel agent
- **Ingress rules local**: Managed in `cloudflared/config.yml` (not dashboard)
- **Tunnel credentials**: Stored as `.json` file, must be kept secure

### Layer 3: Caddy Reverse Proxy

Optional basic authentication:

- **Environment-controlled**: `CADDY_AUTH_ENABLED=true/false`
- **Per-service control**: `JELLYFIN_AUTH_ENABLED=true/false`
- **bcrypt hashed passwords**: Configured via `BASIC_AUTH_HASH`
- **Applied only on public access** (LAN bypass)

**Default behavior**:
- Admin apps (Jellyseerr, Radarr, Sonarr, qBittorrent, Prowlarr, SABnzbd): Auth required if `CADDY_AUTH_ENABLED=true`
- Jellyfin: Auth disabled by default (`JELLYFIN_AUTH_ENABLED=false`) because:
  1. Jellyfin has built-in user authentication
  2. TV clients (Google TV, Apple TV, etc.) can't handle double-auth
  3. Basic auth breaks Jellyfin API access for mobile apps

### Layer 4: Application-Level Security

Each service has its own authentication:

- **Jellyfin**: Built-in user management, required for full access
- **Jellyseerr**: Integrates with Jellyfin auth
- **Radarr/Sonarr/Prowlarr**: API keys required, optional auth
- **qBittorrent**: WebUI authentication, IP whitelist support
- **SABnzbd**: API key authentication

### Security Design Principles

1. **Defense in depth**: Multiple security layers
2. **Least privilege**: Services can only communicate as needed
3. **Public-first design**: Jellyfin must work for TV clients without complex auth
4. **Admin protection**: Management tools protected by auth
5. **LAN trust**: Local network access unrestricted for convenience

### Important Security Notes

- **Jellyfin is publicly accessible**: This is intentional and required for TV clients. Jellyfin's built-in authentication is the primary security boundary.
- **Admin services should use auth**: Either Caddy basic auth or Cloudflare Access to prevent unauthorized management access.
- **Tunnel credentials are sensitive**: Treat `<tunnel-id>.json` like a password. Compromise allows proxying traffic through your tunnel.
- **LAN is trusted**: Direct port access has no auth. Use WiFi passwords, VLANs, or VPNs for LAN security.

## Infrastructure as Code

DulceJelly separates local configuration from cloud resources:

### Local Configuration (Generated)

Managed by `infra/setup.ts`:

1. **`cloudflared/config.yml`**
   - Tunnel ingress rules
   - Maps hostnames to Caddy
   - Local file, never in Cloudflare dashboard
   - Regenerated when hostnames change

2. **`caddy/Caddyfile`**
   - HTTP routing by hostname
   - Reverse proxy configuration
   - Basic auth setup
   - Generated, then manually edited as needed

3. **`.env`**
   - Service ports, paths, credentials
   - Not checked into git
   - Generated template provided

### Cloudflare Resources (Pulumi)

Managed by `infra/cloudflare/` Pulumi project:

1. **DNS Records**
   - CNAME for each service hostname
   - Points to `<tunnel-id>.cfargotunnel.com`
   - Proxied through Cloudflare

2. **WAF Rulesets**
   - Custom rules for bot blocking, geo-restriction
   - Managed rulesets (OWASP)
   - Rate limiting rules

3. **Cloudflare Access** (optional)
   - Applications for admin services
   - Policies for access control
   - Requires IdP configuration

### Why This Split?

- **Tunnel ingress is local**: Cloudflare recommends local YAML for ingress rules (not dashboard-managed) for:
  - Version control
  - Declarative configuration
  - No API rate limits
  - Easier automation

- **DNS/WAF are cloud**: These resources exist only in Cloudflare, managed via Pulumi for:
  - Reproducibility
  - Infrastructure as code
  - Team collaboration
  - Change tracking

## Service Details

### Jellyfin (Media Server)

- **Purpose**: Stream movies and TV shows to any device
- **Ports**: 8096 (HTTP), 8920 (HTTPS)
- **Storage**:
  - `/config`: App configuration, database, plugins
  - `/cache`: Transcoding cache, thumbnails
  - `/Volumes/Movies`: Media library (read-only from container perspective)
  - `/Volumes/Series`: TV library (read-only from container perspective)
- **Authentication**: Built-in user management
- **Clients**: Web, Android, iOS, Roku, Google TV, Apple TV, etc.
- **Transcoding**: CPU-based (hardware acceleration requires device passthrough)

### Jellyseerr (Request Management)

- **Purpose**: Users request content, auto-sends to Radarr/Sonarr
- **Port**: 5055
- **Storage**: `/app/config` (SQLite database)
- **Integration**: Connects to Jellyfin for user auth and library status
- **Features**:
  - Discover content via TMDB
  - Request movies or TV shows
  - Approve/deny requests (if approval required)
  - Notifications (Discord, email, etc.)

### Radarr (Movie Management)

- **Purpose**: Automate movie downloads and organization
- **Port**: 7878
- **Storage**:
  - `/config`: App configuration, database
  - `/downloads`: Monitor for completed downloads
  - `/movies`: Media library (read-write)
- **Integration**: Uses Prowlarr indexers, qBittorrent for downloading
- **Features**:
  - Auto-search for movies
  - Quality profiles (managed by Recyclarr)
  - Rename and organize files
  - Upgrade existing files to better quality

### Sonarr (TV Show Management)

- **Purpose**: Automate TV show downloads and organization
- **Port**: 8989
- **Storage**: Similar to Radarr
- **Features**: Episode tracking, season packs, series monitoring

### qBittorrent (Torrent Client)

- **Purpose**: Download torrents
- **Ports**: 8080 (WebUI), 6881 (peers)
- **Storage**:
  - `/config`: App configuration
  - `/downloads`: Download destination
  - `/watch`: Auto-add torrents
- **WebUI**: http://localhost:3275 (localhost only for security)
- **Security**: Host header validation, IP whitelist for LAN

### Prowlarr (Indexer Manager)

- **Purpose**: Centralize indexer (tracker/Usenet source) management
- **Port**: 9696
- **Storage**: `/config` (indexer credentials, sync settings)
- **Integration**: Auto-syncs indexers to Radarr/Sonarr
- **Features**: Test indexers, manage credentials, search across all indexers

### SABnzbd (Usenet Downloader)

- **Purpose**: Download from Usenet
- **Port**: 8080
- **Storage**:
  - `/config`: App configuration, queue
  - `/downloads`: Completed downloads (default: SSD for speed)
  - `/incomplete`: In-progress downloads (default: SSD for speed)
- **Features**: NZB queue, automatic unpacking, repair

### Recyclarr (Quality Profile Sync)

- **Purpose**: Keep Radarr/Sonarr quality profiles updated from TRaSH Guides
- **No ports**: Scheduled job only (cron)
- **Storage**: `/config` (YAML configuration)
- **Schedule**: Daily at 4 AM (configurable via `RECYCLARR_CRON`)

### Caddy (Reverse Proxy)

- **Purpose**: Route requests and handle basic auth
- **Ports**: 80 (HTTP), 443 (HTTPS)
- **Storage**:
  - `/etc/caddy/Caddyfile`: Routing rules
  - `/data`: TLS certificates (if enabled)
  - `/config`: Caddy state
  - `/srv`: Static files (landing page, logos)
- **Features**:
  - Automatic HTTPS (disabled, using Cloudflare TLS)
  - Basic authentication
  - Header forwarding
  - Static file serving

## Repository Structure

DulceJelly uses a monorepo structure with npm workspaces and Turborepo for build management:

```
dulce-jelly/
├── packages/                       # Workspace packages
│   ├── ms-cli/                     # TypeScript CLI (CORE - required)
│   │   ├── src/                    # TypeScript source files
│   │   ├── dist/                   # Compiled JavaScript output
│   │   ├── tsconfig.json           # TypeScript config
│   │   └── package.json            # Package definition
│   ├── quality-broker/             # LLM quality broker (OPTIONAL)
│   │   └── src/                    # TypeScript source
│   └── infra-setup/                # Infrastructure setup scripts (OPTIONAL)
│       └── src/                    # TypeScript source
├── apps/                           # Application packages
│   └── cloudflare/                 # Pulumi IaC for Cloudflare (OPTIONAL)
│       └── index.ts                # Pulumi program
├── turbo.json                      # Turborepo pipeline config
└── package.json                    # Root workspace config
```

### Build System

- **Tool**: Turborepo with npm workspaces
- **Build all**: `npm run build` (builds all packages with caching)
- **Build core**: `npm run build:core` (ms-cli only)
- **Build optional**: `npm run build:optional` (quality-broker, infra-setup)
- **Lint**: `npm run lint` (lints all TypeScript packages)
- **Cache**: Turborepo caches build outputs (typical rebuild: ~50ms)

### Package Types

- **ms-cli**: Core CLI tool for managing Docker stack - REQUIRED
- **quality-broker**: LLM-driven Radarr quality profile assignment - OPTIONAL
- **infra-setup**: Infrastructure setup wizard - OPTIONAL
- **cloudflare**: Pulumi IaC for DNS/WAF/tunnels - OPTIONAL

Optional packages are not needed for core media stack operation.

## File Structure

```
dulce-jelly/
├──
│   ├── docker-compose.yml          # Service definitions
│   ├── .env                         # Environment variables (not in git)
│   ├── .env.example                 # Template
│   ├── data/                        # Persistent app state (bind mounts)
│   │   ├── jellyfin/
│   │   │   ├── config/              # Jellyfin database, plugins
│   │   │   └── cache/               # Transcoding cache
│   │   ├── jellyseerr/
│   │   ├── radarr/
│   │   ├── sonarr/
│   │   ├── qbittorrent/
│   │   ├── prowlarr/
│   │   ├── sabnzbd/
│   │   ├── recyclarr/
│   │   └── caddy/
│   ├── caddy/
│   │   ├── Caddyfile                # Reverse proxy config
│   │   └── site/                    # Landing page assets
│   ├── cloudflared/
│   │   ├── config.yml               # Tunnel ingress rules (generated)
│   │   └── <tunnel-id>.json         # Tunnel credentials (secret)
│   ├── test/
│   │   └── test-services.test.mjs   # Smoke tests
│   └── docs/
│       ├── architecture.md          # This file
│       ├── service-setup-guide.md   # Setup instructions
│       └── cloudflared-setup.md     # Tunnel setup guide
├── infra/
│   ├── setup.ts                     # Interactive config generator
│   ├── package.json                 # Setup script dependencies
│   ├── README.md                    # Infrastructure setup guide
│   └── cloudflare/                  # Pulumi IaC
│       ├── index.ts                 # Main Pulumi program
│       ├── Pulumi.yaml              # Project config
│       ├── Pulumi.dev.yaml          # Stack config template
│       ├── package.json             # Pulumi dependencies
│       └── README.md                # Pulumi project docs
├── README.md                        # User-facing docs
├── CLAUDE.md                        # Project conventions (for AI agents)
└── TODO.md                          # Task tracking
```

### Important Paths

#### On Host

- **Media libraries**: `/Volumes/MEDIA1/{Movies,Series}`
- **SSD downloads**: `/Volumes/MoviesSSD1/New/sab/{done,progress}`
- **App state**: `data/*` (must persist across restarts)

#### In Containers

- **Jellyfin media**: `/Volumes/Movies`, `/Volumes/Series` (read-only bind mounts)
- **Radarr media**: `/movies` (read-write bind mount to `/Volumes/MEDIA1/Movies`)
- **Sonarr media**: `/series` (read-write bind mount to `/Volumes/MEDIA1/Series`)
- **Download clients**: `/downloads` (shared across Radarr/Sonarr/downloaders)

### Data Persistence

All stateful data is in `data/`, which is:
- **Bind-mounted** from host (not Docker volumes)
- **Backed up** weekly via Carbon Copy Cloner (MEDIA1 → MEDIA2)
- **Owned by PUID:PGID** (default 1000:1000)
- **UMASK 002**: Group-writable for shared access

## Operational Notes

### Starting the Stack

```bash
cd media-server
docker compose up -d
```

### Stopping the Stack

```bash
docker compose down
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f jellyfin

# Last 100 lines
docker compose logs --tail=100 jellyfin
```

### Restarting a Service

```bash
docker compose restart jellyfin
```

### Updating Services

```bash
# Pull latest images
docker compose pull

# Recreate containers with new images
docker compose up -d

# Clean up old images
docker image prune
```

### Backups

- **Media libraries**: Weekly full clone via Carbon Copy Cloner (MEDIA1 → MEDIA2)
- **App state**: Included in CCC backup (data is on MEDIA1)
- **Configuration**: Check into git (except `.env` and tunnel credentials)

### Rotating Tunnel Credentials

1. Create new tunnel in Cloudflare dashboard
2. Download new credentials JSON
3. Update `cloudflared/config.yml` with new tunnel ID
4. Update `cloudflared/<new-tunnel-id>.json`
5. Update Pulumi config: `dulcejelly-cloudflare:tunnelId`
6. Run `pulumi up` to update DNS records
7. Restart cloudflared: `docker compose restart cloudflared`

### Monitoring

- **Service health**: `docker compose ps`
- **Resource usage**: `docker stats`
- **Disk space**: `df -h /Volumes/MEDIA1`
- **Drive health**: DriveDx (USB/SATA bridge may block SMART self-tests)

### Performance Notes

- **Observed copy speed**: ~260 MB/s (SSD → MEDIA1)
- **Transcoding**: CPU-based, no GPU acceleration configured
- **Download paths**: Use SSD for in-progress downloads, HDD for final storage
- **Ambient temperature**: ~24°C room temperature

## Troubleshooting

See the consolidated guide: [troubleshooting.md](troubleshooting.md)

## Further Reading

- **Jellyfin Documentation**: https://jellyfin.org/docs/
- **Cloudflare Tunnel Docs**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Pulumi Cloudflare Provider**: https://www.pulumi.com/registry/packages/cloudflare/
- **Caddy Documentation**: https://caddyserver.com/docs/
- **TRaSH Guides** (Quality profiles): https://trash-guides.info/

---

For step-by-step setup instructions, see [../../README.md](../../README.md).
