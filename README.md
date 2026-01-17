![Dulce Jelly](caddy/site/logos/dulce-jelly.png)

# DulceJelly

A self-hosted personal media server and automation stack for managing, evaluating, and
serving a personal movie and TV/Series collection, with built-in support for metadata
enrichment, quality assessment, and lifecycle management.

DulceJelly emphasizes **library intelligence** — tracking what exists in your
collection, enriching it with external metadata, analyzing quality and encoding
characteristics, and coordinating user-defined upgrade or replacement workflows
over time.

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

Already configured? Start your media server:

```bash
# Navigate to the project root
docker compose up -d
```

Access Jellyfin at: `http://localhost:3278`

## Setup Guide

Follow these steps to set up your DulceJelly media server from scratch.

### Prerequisites

Before you begin, make sure you have:

1. **Docker Desktop** installed ([Download here](https://www.docker.com/products/docker-desktop))
2. **Node.js** (v18 or newer; repo pins 22.19.0 via `.nvmrc`) installed ([Download here](https://nodejs.org/))
3. **A Cloudflare account** (free) ([Sign up here](https://dash.cloudflare.com/sign-up))
4. **A domain name** managed by Cloudflare (can be transferred or registered there)
5. **Legal media content** to manage (a ROOT folder with copies of movies or shows you own. It's recommended to use a single media root if possible, or ensure your media root has adequate disk space for automation to move files into it)

### Step 1: Get the Code

```bash
# Clone this repository
git clone <your-repo-url>
cd dulce-jelly
```

### Step 2: Run the Setup Script

This script will ask you questions and generate configuration files:

```bash
cd infra
npm install
npm run setup
```

The script will ask you for:

- Your domain name (e.g., `mydomain.com`)
- Your Cloudflare Tunnel ID (we'll help you create this)
- Which services you want to expose
- Security preferences (authentication, etc.)

**Follow the prompts carefully.** The script generates:

- Tunnel configuration (how Cloudflare connects to your server)
- Reverse proxy configuration (how requests are routed)
- Environment variables (your personal settings)

### Step 3: Set Up Your Cloudflare Tunnel

A Cloudflare Tunnel lets you access your server from anywhere without opening firewall ports.

1. **Log in to Cloudflare**:
   - Go to: https://one.dash.cloudflare.com/
   - Navigate to: **Networks** → **Tunnels**

2. **Create a new tunnel**:
   - Click **Create a tunnel**
   - Choose **Cloudflared**
   - Give it a name (e.g., "dulcejelly")
   - **Don't configure connectors** - we'll use Docker instead
   - On the next page, note your **Tunnel ID** (long string of letters and numbers)

3. **Download credentials**:
   - Click on your tunnel
   - Download the credentials JSON file
   - Rename it to `<tunnel-id>.json` (your tunnel ID from step 2)
   - Move it to: `cloudflared/<tunnel-id>.json`

4. **Skip the route configuration** in the Cloudflare dashboard - this is handled automatically by your local configuration.

### Step 4: Configure Cloudflare (optional: to reach your services through internet)

Now we'll set up DNS records and security rules in Cloudflare:

```bash
cd cloudflare

# Install dependencies
npm install

# Log in to Pulumi (you can use the free tier)
pulumi login

# Create a new stack (like a project environment)
pulumi stack init prod
```

**Set your Cloudflare credentials:**

```bash
# Replace YOUR_API_TOKEN with a token from:
# https://dash.cloudflare.com/profile/api-tokens
# (needs Zone:DNS:Edit and Zone:Zone:Read permissions)
pulumi config set --secret cloudflare:apiToken YOUR_API_TOKEN

# Set your Cloudflare account ID
# (found in the URL when you're logged in: dash.cloudflare.com/YOUR_ACCOUNT_ID)
pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID

# Set your zone ID
# (found on your domain's Overview page in Cloudflare dashboard)
pulumi config set zoneId YOUR_ZONE_ID
```

**Merge the generated configuration:**

The setup script created a file called `Pulumi.config-snippet.yaml` with your settings. Copy the configuration from that file into your `Pulumi.prod.yaml` (or whatever you named your stack).

**Deploy your infrastructure:**

```bash
# Preview what will be created
pulumi preview

# Create the resources
pulumi up
```

This sets up:
- DNS records for all your services
- Security rules (firewall, rate limiting)
- Optional: access controls for admin tools

### Step 5: Configure Your Media Server

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

3. **Review generated configs**:

   - Check `cloudflared/config.yml` - should list all your hostnames
   - Check `caddy/Caddyfile.generated` - if it looks good, replace `caddy/Caddyfile` with it

### Step 6: Start Your Media Server

```bash
docker compose up -d
```

Wait a minute for everything to start, then check status:

```bash
docker compose ps
```

All services should show as "running".

### Step 7: Initial Service Configuration

Complete the one-time service setup using the guide: [docs/service-setup-guide.md](docs/service-setup-guide.md).

### Step 8: Test Everything

```bash
# Navigate to the project root
export TEST_AUTH_USER=your_username TEST_AUTH_PASS=your_password
node --test test/test-services.test.mjs
```

All tests should pass.

### Step 9: Start Using DulceJelly!

You're done! Now you can:

- **Stream your media**: Open Jellyfin on any device to access your personal library
- **Manage your library**: Use the admin tools to organize and monitor your collection
- **Access remotely**: Use your public URLs (e.g., `https://jellyfin.mymedialibrary.example`)

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
export TEST_AUTH_USER=your_username TEST_AUTH_PASS=your_password
node --test test/test-services.test.mjs
```

Quick health check: `npm run ms doctor` (health, mounts, recent log scan).

Tests check:
- All services are reachable
- Authentication works correctly
- Jellyfin is accessible without breaking TV clients
- Admin services are protected
- HTTPS redirects work

## Documentation

- **[architecture.md](docs/architecture.md)** - Technical details, request flow, security model
- **[Service Setup Guide](docs/service-setup-guide.md)** - Detailed configuration for each service
- **[Cloudflare Tunnel Setup](docs/cloudflared-setup.md)** - In-depth tunnel configuration
- **[ms CLI](docs/ms-cli.md)** - Short commands for operating the stack
- **[Quality Broker](docs/quality-broker.md)** - LLM-guided Radarr quality assignment with grounded, schema-validated decisions
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

**See [architecture.md](docs/architecture.md) for technical deep dive.**

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

2. **Import sample tasks**:
   - Open Carbon Copy Cloner
   - Customize the task files from `scripts/backup/ccc-tasks/sample/`
   - Update source/destination paths and preflight script paths to match your setup
   - Import in CCC and change scheduling and other task settings as needed

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
