![Dulce Jelly](caddy/site/logos/dulce-jelly.png)

# DulceJelly

A self-hosted media server stack emphasizing **library intelligence**: tracking inventory,
enriching metadata from external sources, analyzing quality and encoding characteristics,
and coordinating upgrade or replacement workflows over time for your personal movie and TV collection.

**Designed for:**

- 📺 Streaming a self-hosted movie and TV collection across personal devices
- 🎬 Enriching media with metadata from public databases (ratings, cast, summaries)
- 🔍 Evaluating files for quality, resolution, and encoding characteristics
- 🔁 Managing upgrade or replacement workflows within an existing library
- 📚 Organizing, normalizing, and maintaining large media collections
- 🌐 Secure remote access to a private media server
- 💾 Centralized storage, resilience, and backup management


## ⚖️ Legal Notice

> DulceJelly provides infrastructure patterns and configuration guidance for managing
> self-hosted media libraries, including copies of media you own or have rights to use.
> It does not include content, content sources, or preconfigured acquisition mechanisms,
> and it does not endorse or facilitate the acquisition of copyrighted content.
> Users are responsible for ensuring their use of third-party software complies with
> applicable laws.


## What's Included

DulceJelly is a collection of open-source media management tools:

- **[Jellyfin](https://jellyfin.org/)** - Media server for streaming your personal library
- **[Jellyseerr](https://github.com/Fallenbagel/jellyseerr)** - Library management and monitoring interface
- **[Radarr](https://radarr.video/)** - Movie library manager and organizer
- **[Sonarr](https://sonarr.tv/)** - TV show library manager and organizer
- **[Prowlarr](https://prowlarr.com/)** - Indexer manager for content sources
- **[FlareSolverr](https://github.com/FlareSolverr/FlareSolverr)** - Cloudflare challenge solver used by some indexers via Prowlarr
- **[qBittorrent](https://www.qbittorrent.org/)** - BitTorrent client
- **[SABnzbd](https://sabnzbd.org/)** - Usenet client
- **[Recyclarr](https://recyclarr.dev/)** - Quality profile synchronization
- **[Caddy](https://caddyserver.com/)** - Reverse proxy server
- **[Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/)** - Secure remote access


## Table of Contents

- [Quick Start](#quick-start)
- [Setup Guide](#setup-guide)
- [Accessing Your Services](#accessing-your-services)
- [Testing](#testing)
- [Documentation](#documentation)

## Quick Start

If you are familiar with the services in this repo, the shortest path is:

```bash
# Install dependencies and build
npm run setup

# Configure services (edit .env and follow the service setup guide)
# Then bring the stack up
npm run ms -- up
```

Access Jellyfin at: `http://localhost:3278`

## Setup Guide

Follow these steps to set up your DulceJelly media server.

### Prerequisites

Before you begin, make sure you have:

1. **Docker Desktop** installed ([Download here](https://www.docker.com/products/docker-desktop))
2. **Node.js** (v18 or newer; repo pins 22.19.0 via `.nvmrc`) installed ([Download here](https://nodejs.org/))
3. **Legal media content** to manage (a ROOT folder with copies of movies or shows you own. It's recommended to use a single media root if possible, or ensure your media root has adequate disk space for automation to move files into it)

**Optional (for internet access):**
- **A Cloudflare account** (free) ([Sign up here](https://dash.cloudflare.com/sign-up))
- **A domain name** managed by Cloudflare (can be transferred or registered there)

### Step 1: Get the Code & Build

```bash
# Clone this repository
git clone <your-repo-url>
cd dulce-jelly

# Install dependencies and build
npm run setup
```

### Step 2: Configure Your Media Server

1. **Copy the environment template**:

   ```bash
   # Navigate to the project root
   cp .env.example .env
   ```

2. **Edit `.env`** with your settings:

   ```bash
   # Use your favorite text editor
   nano .env
   ```

   Important settings:

   - `PUID` and `PGID`: Your user ID (run `id -u` and `id -g` in terminal)
   - `BASIC_AUTH_USER` and `BASIC_AUTH_PASS`: Create a username and password for web access
   - `JELLYFIN_MOVIES` and `JELLYFIN_SERIES`: Where your media files are stored
   - Generate `BASIC_AUTH_HASH` using:
     ```bash
     docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
     ```

### Step 3: Start Your Media Server

```bash
docker compose up -d
```

Wait a minute for everything to start, then check status:

```bash
docker compose ps
```

All services should show as "running".

### Step 4: Initial Service Configuration

Complete the one-time service setup using the guide: [docs/service-setup-guide.md](docs/service-setup-guide.md).

This includes configuring:
- Jellyfin (media library paths, users)
- Radarr and Sonarr (quality profiles, indexers)
- Download clients (qBittorrent, SABnzbd)
- Prowlarr (indexer management)

## Optional: Setup Cloudflare for Internet Access

If you want to access your media server from anywhere on the internet, follow these additional steps:

### Step 5 (Optional): Run the Setup Script

This script helps configure Cloudflare Tunnel:

```bash
cd packages/infra-setup
npm run setup
```

The script will ask you for:
- Your domain name (e.g., `mydomain.com`)
- Your Cloudflare Tunnel ID
- Which services you want to expose
- Security preferences

### Step 6 (Optional): Set Up Your Cloudflare Tunnel

1. **Log in to Cloudflare**:
   - Go to: https://one.dash.cloudflare.com/
   - Navigate to: **Networks** → **Tunnels**

2. **Create a new tunnel**:
   - Click **Create a tunnel**
   - Choose **Cloudflared**
   - Give it a name (e.g., "dulcejelly")
   - Note your **Tunnel ID**

3. **Download credentials**:
   - Download the credentials JSON file
   - Rename it to `<tunnel-id>.json`
   - Move it to: `cloudflared/<tunnel-id>.json`

4. **Skip route configuration** in the Cloudflare dashboard

### Step 7 (Optional): Configure Cloudflare DNS & Security

### Step 8: Test Everything (Local Network)

```bash
# Test local access
npm run ms -- doctor

# Run full test suite (optional)
export TEST_AUTH_USER=your_username TEST_AUTH_PASS=your_password
node --test test/test-services.test.mjs
```

All tests should pass. You can now access your services locally via `http://localhost:<port>`.

**You're done with basic setup!** You can now:
- **Stream your media**: Open Jellyfin at `http://localhost:3278`
- **Manage your library**: Access Radarr, Sonarr, and other tools on your LAN

---

Set up DNS records and security rules using Pulumi:

```bash
cd infra/cloudflare

# Install dependencies
npm install

# Log in to Pulumi
pulumi login

# Create a stack
pulumi stack init prod

# Set your Cloudflare credentials
pulumi config set --secret cloudflare:apiToken YOUR_API_TOKEN
pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID
pulumi config set zoneId YOUR_ZONE_ID

# Deploy
pulumi up
```

### Step 9 (Optional): Test Internet Access

Access your services via your domain:
- `https://jellyfin.yourdomain.example`
- `https://radarr.yourdomain.example`
- etc.

Run tests with HTTPS URLs (see [Testing](#testing) section below)

## Accessing Your Services

### On Your Local Network

Use direct IP addresses (most reliable):

| Service | Purpose | Local Access |
|---------|---------|--------------|
| **Jellyfin** | Stream your media library | `http://localhost:3278` |
| Jellyseerr | Manage library requests | `http://localhost:3277` |
| Radarr | Movie library management | `http://localhost:3273` |
| Sonarr | TV show library management | `http://localhost:3272` |
| qBittorrent | BitTorrent client | `http://localhost:3275` |
| Prowlarr | Search indexer manager | `http://localhost:3276` |
| SABnzbd | Usenet client | `http://localhost:3274` |

Replace `localhost` with your server's IP address if accessing from another device on your network.

### From the Internet

Use your public domain (requires Cloudflare Tunnel setup):

- `https://jellyfin.mymedialibrary.example` - Stream media (no login required at edge)
- `https://jellyseerr.mymedialibrary.example` - Manage library (login required)
- `https://radarr.mymedialibrary.example` - Manage movies (login required)
- `https://sonarr.mymedialibrary.example` - Manage TV shows (login required)
- And more...

**Note**: 🔒 = Login required (basic auth or Cloudflare Access, depending on your configuration)

## Testing

Run the test suite to verify everything is working:

```bash
# Navigate to the project root
export LAN_HOSTNAME=localhost
export TEST_AUTH_USER=your_username TEST_AUTH_PASS=your_password
# Optional: enable public HTTPS checks
export PUBLIC_DOMAIN=yourdomain.example
npm run test:services
```

Quick health check: `npm run ms doctor` (health, mounts, recent log scan).

Tests check:
- All services are reachable
- Authentication works correctly
- Jellyfin is accessible without breaking TV clients
- Admin services are protected
- HTTPS redirects work

## Documentation

- **[Service Setup Guide](docs/service-setup-guide.md)** - Detailed configuration for each service
- **[Cloudflare Tunnel Setup](docs/cloudflared-setup.md)** - In-depth tunnel configuration
- **[ms CLI](docs/ms-cli.md)** - Short commands for operating the stack
- **[Quality Broker](docs/quality-broker.md)** - Deterministic-first Radarr quality assignment with LLM fallback for ambiguous edge cases (vote-count popularity index, optional re-eval by profile)
 - **[architecture.md](docs/architecture.md)** - Technical details, request flow, security model
- **[Pulumi Infrastructure README](infra/cloudflare/README.md)** - IaC documentation and configuration reference
- **[CLAUDE.md](CLAUDE.md)** - Project conventions for developers and AI agents
- **[TODO.md](TODO.md)** - Current development status and pending tasks

## How It Works

```
Your Request
    ↓
Cloudflare (DNS + Security)
    ↓
Encrypted Tunnel to Your Server
    ↓
Caddy (Routes to Right Service)
    ↓
Service (Jellyfin, Radarr, etc.)
    ↓
Your Personal Media Library
```

**See [architecture](docs/architecture.md) for technical deep dive.**

## Troubleshooting

**First check**
- `ms status` to see container state; 
- `# Navigate to the project root`. Run `npm run ms -- doctor`) for health/mounts/log scan.
- `ms logs <svc>` to tail logs (Caddy/Cloudflared output is auto-pretty).

**Common issues**
- LAN access: use `http://<server-ip>:<port>` if `localhost` fails; confirm `docker compose ps` shows running.
- Internet access: `docker compose logs cloudflared`, verify Cloudflare DNS, ensure tunnel creds file exists.
- Services won't start: `docker compose logs <service>`, verify `.env` paths, check disk space (`df -h`).

**More help**: See [Troubleshooting Guide](docs/troubleshooting.md)

## Updating

Pull the latest images and restart:

```bash
# Navigate to the project root
docker compose pull
docker compose up -d
```


## Backup with Carbon Copy Cloner

DulceJelly includes sample preflight scripts for [Carbon Copy Cloner](https://bombich.com/) (CCC) to automate media backup workflows on macOS. These scripts ensure backup destinations are mounted and clean junk files before backup begins.

### Setup

1. **Configure environment**:
   ```bash
   cd scripts/backup
   cp .env.example .env
   # Edit .env and configure:
   # - LOG_DIR: Directory for script logs
   # - VOL_NAME: Backup volume name (e.g., MEDIA2)
   # - VOLUME_UUID: Optional volume UUID (recommended if duplicate names exist)
   # - Mount wait timeouts (MIN_WAIT_SEC, MAX_WAIT_SEC, POLL_SEC)
   ```

2. **Create CCC tasks**:
   - Open Carbon Copy Cloner
   - Import in CCC under preflight and apply task settings as needed

The preflight scripts handle:
- **Mount verification**: Ensures backup destination volumes are mounted before backup
- **Junk cleanup**: Removes sidecar files (`.DS_Store`, Some Release Group sidecar fo;es, partial downloads, etc.) to reduce backup disk fragmentation.


## Need Help?

- **Architecture questions**: See [architecture.md](docs/architecture.md)
- **Service setup**: See [Service Setup Guide](docs/service-setup-guide.md)
- **Cloudflare issues**: See [Pulumi README](infra/cloudflare/README.md)
- **Report issues**: Check [TODO.md](TODO.md) or open a GitHub issue

---

**Built for personal media enthusiasts** 🎬
