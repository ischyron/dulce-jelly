# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Work through todos independently; pause only if human review is required.
- Strike out or mark status when done/blocked.

### Todo Items/Issues
- [TODO] delete only brokerManagedTags when processing a new movie in Radarr using quality broker
- [TODO] Remove hardcoded decision profile names (HD/Efficient-4K/HighQuality-4K) from quality-broker code; derive only from config
- [BLOCKED] Approch refinement needed: When logged in on mymedialibrary.example via Caddy I need same login to work for the sub domains like sab.mymedialibrary.example. Blocked on moving auth to Zero trust Cloudlfare as it supports only 5 domains in FREE and this is a re-usable tech stack and I dont want to rely on cost heavy setup. Current approch is to understad more details around DNS config to be made to allow *.mymedialibrary.example to be under auth mapping to tunnel domains and then add exclusion policy for jellyfin.
- [BLOCKED] Set up Jellyseerr config in Jellyfin Enhanced plugin so Jellyfin users can add movies (requires Jellyfin UI access).

- [BLOCKED] qBittorrent lockout of IP from accessing.
  - Gating: must retain qBittorrent WebUI security protections; no weakening that compromises exposure over internet (keep host/referrer safeguards effective while making config persistent).
  - Access paths: LAN `http://localhost:3275` or `http://<server-ip>:3275` (or `http://media.local:3275`); public `http://qb.mymedialibrary.example` behind Caddy basic auth; `http://media.local/qb` issues 307 → `:3275`; Cloudflare tunnel via `https://qb.mymedialibrary.example`.
  - Behavior: initial WebUI config (currently HostHeaderValidation=false, LocalHostAuth=false, subnet whitelist on) saves using temporary password from logs, but any later manual changes are lost after container restart; `qBittorrent.conf` looks regenerated and WebUI can return unauthorized without showing login.
  - Log warnings (from `data/qbittorrent/config/qBittorrent/logs/qbittorrent.log`): repeated `WebUI: Invalid Host header, port mismatch ... Received Host header: 'localhost:3275'` and `WebUI: Referer header & Target origin mismatch ... Referer header: 'https://mymedialibrary.example/' ... Target origin: 'qb.mymedialibrary.example'` around restarts.
  - Suspected causes: (1) qBittorrent may be unable to persist later edits because files under `data/qbittorrent/config/qBittorrent/` are owned by `501:20` with 744/644 perms (container runs as PUID/PGID=1000). **Counterpoint:** first-run WebUI changes (using temp admin password) were written successfully, so permission may only break on subsequent runs or after UID/GID changes; needs validation. (2) WebUI security protections might rewrite/lock config back to “known good” when host/referrer warnings fire (invalid host header / referer mismatch), blocking further updates.
  - Caddy path: `qb.mymedialibrary.example` is proxied with basic auth and no header overrides (Host expected to be preserved). Observed warnings: referer mismatch when navigating from `https://mymedialibrary.example` to qb; host-header mismatch when accessing via `localhost:3275`. Need to verify (not yet confirmed) how Host arrives when coming through Cloudflare/HTTPS.
  - Actions taken: enabled `HostHeaderValidation=true`; set `WebUI\ServerDomains=qb.mymedialibrary.example,media.local,localhost,127.0.0.1,::1`; added `Referrer-Policy: no-referrer` header on `mymedialibrary.example` in Caddy to curb referer warnings. `LocalHostAuth` and whitelist unchanged (LAN-friendly). No matter some caddy config still prevents domain validation and blocks were happenings - this is perpahs at the time an invalid password was in prowlaar. Need to try this again.
