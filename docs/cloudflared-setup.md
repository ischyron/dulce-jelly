# Cloudflared Tunnel Setup Guide

## Overview
Cloudflare Tunnel allows secure remote access to your media stack without port forwarding or exposing services directly to the internet. Traffic flows through Cloudflare's edge network to your local services.

## Current Status
- **Status:** Not configured (container restarting)
- **Blocker:** Missing real `TUNNEL_ID` and credentials JSON file
- **Config file:** `cloudflared/config.yml` (has placeholders)

## Prerequisites
1. Cloudflare account with a domain (`mymedialibrary.example`)
2. Domain DNS managed by Cloudflare
3. `cloudflared` CLI installed on host (for setup only)

## Setup Steps

### 1. Install cloudflared CLI (one-time)
```bash
# macOS
brew install cloudflared

# Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

### 2. Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
This opens a browser window to authorize `cloudflared` and downloads an origin certificate (`~/.cloudflared/cert.pem`).

### 3. Create the Tunnel
```bash
cloudflared tunnel create media-server
```
This command:
- Creates a tunnel named `media-server`
- Generates a credentials JSON file: `~/.cloudflared/<TUNNEL_ID>.json`
- Outputs the `TUNNEL_ID` (a UUID)

**Save the `TUNNEL_ID` - you'll need it in the next steps.**

### 4. Copy Credentials to Project
```bash
cp ~/.cloudflared/<TUNNEL_ID>.json ./cloudflared/
```

### 5. Update config.yml
Edit `cloudflared/config.yml` and replace placeholders:

**Note:** The apex `mymedialibrary.example` entry is required so the landing page loads over Cloudflare (otherwise you'll see 404/blank/download behavior). Caddy stays HTTP-only; TLS terminates at Cloudflare, so keep `service: http://caddy:80`.

### 6. Configure DNS Routes
For each hostname, create a DNS CNAME record pointing to the tunnel:
```bash
cloudflared tunnel route dns media-server jellyfin.mymedialibrary.example
cloudflared tunnel route dns media-server jellyseerr.mymedialibrary.example
cloudflared tunnel route dns media-server qb.mymedialibrary.example
cloudflared tunnel route dns media-server prowlarr.mymedialibrary.example
cloudflared tunnel route dns media-server radarr.mymedialibrary.example
cloudflared tunnel route dns media-server sonarr.mymedialibrary.example
cloudflared tunnel route dns media-server sab.mymedialibrary.example
cloudflared tunnel route dns media-server mymedialibrary.example
```

Alternatively, manually create CNAME records in Cloudflare dashboard:
- Record type: `CNAME`
- Name: `jellyfin` (or `@` for apex domain)
- Target: `<TUNNEL_ID>.cfargotunnel.com`
- Proxy status: Proxied (orange cloud)

### 7. Restart the Container
```bash
cd media-server
docker compose restart cloudflared
docker compose logs -f cloudflared
```

You should see logs like:
```
INF Connection established
INF Registered tunnel connection
```

### 8. Test Public Access
From outside your network (or using cellular data):
```bash
curl https://jellyfin.mymedialibrary.example
```

## Architecture Flow
```
Internet → Cloudflare Edge → Tunnel → caddy:80 → Services
```

- All traffic is encrypted through Cloudflare's network
- Tunnel terminates at the `cloudflared` container
- Traffic forwards to Caddy on internal Docker network
- Caddy routes to services based on hostname/path

## Security Notes
1. **Basic Auth:** Caddy applies basic auth on mymedialibrary.example subdomains (except `/jellyfin*`)
2. **Jellyfin:** No basic auth (has built-in user authentication)
3. **TLS:** Cloudflare handles TLS termination; internal traffic is HTTP
4. **Rate Limiting:** Consider adding Cloudflare rate limiting rules
5. **Access Policies:** Use Cloudflare Access for additional security (optional)

## Troubleshooting

### Container keeps restarting
Check logs: `docker compose logs cloudflared`
- **Missing TUNNEL_ID:** Update config.yml with real tunnel ID
- **Missing credentials:** Ensure `<TUNNEL_ID>.json` exists in `cloudflared/` directory
- **Invalid format:** Verify config.yml syntax (YAML indent with spaces, not tabs)

### Can't reach services publicly
1. Verify DNS propagation: `dig jellyfin.mymedialibrary.example`
2. Check tunnel status: `cloudflared tunnel info media-server`
3. Verify container is running: `docker compose ps cloudflared`
4. Test Caddy locally first: `curl http://localhost/jellyfin`

### Services work on LAN but not via Cloudflare
- Caddy configuration may need adjustment for subdomain routing
- Check Caddy logs: `docker compose logs caddy`
- Verify `BASIC_AUTH_USER`/`BASIC_AUTH_HASH` are set in environment

## References
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflared Installation Guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
