# Troubleshooting Guide

Use `ms` CLI first:
- `ms status` — container state
- `ms doctor` — health, mounts, recent log scan

## Common Issues

### Services won't start
- Logs: `docker compose logs <service>`
- Ports: ensure host port is free
- Permissions: verify PUID/PGID match host user
- Disk: `df -h`

### Can't access on LAN
- Use `http://<server-ip>:<port>` instead of `localhost`
- Check containers: `docker compose ps`
- Network: `docker network inspect media_net`

### Can't access via Cloudflare
- Tunnel: `docker compose logs cloudflared`
- DNS: verify records in Cloudflare; `nslookup <service>.yourdomain.example`
- Tunnel creds: ensure file exists under `cloudflared/`

### Jellyfin streaming issues
- Transcoding: Jellyfin Dashboard → Playback → Transcoding
- Base URL: Jellyfin Dashboard → Networking
- Client codecs: confirm client support; check `docker compose logs jellyfin`

### Downloads not starting
- Indexers: Prowlarr → Indexers → Test
- Download client: Radarr/Sonarr → Settings → Download Clients → Test
- Connectivity: qBittorrent peers or SABnzbd server status
- Disk space: ensure download paths have space

### Cloudflare Access / WAF
- Policy: Zero Trust → Access → Applications (Jellyfin should not be behind Access)
- WAF: check events; relax rules if blocking legitimate traffic
- Browser: clear cookies or use incognito

### qBittorrent lockout
- Temporary password: `docker compose logs qbittorrent | grep -i "temporary password"`
- Reset (destructive): stop service, remove `data/qbittorrent/config/qBittorrent/`, start again, use new temp password.

### Permission errors
- Check ownership of `data/**` matches PUID/PGID (default 1000:1000)
- Ensure download/incomplete paths exist and are writable
