# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Always read the TODO from disk, as the human keeps this updated and the latest status and feedback on tasks are important.
- Work through todos independently; pause only if human review is required.
- Strike out when done/blocked.
- Don't create new sections for TODOs or bugs. Keep status inline.
- After feature/fix complete, deploy it on docker. Then mark as complete or done 

### Curatarr Backlog


**CF scoring, Rules, Scout**

- [DONE] ~~Show colors in HTML in tooltip. Tooltip on status column on Libary page~~ (status tooltip now renders colored dots and labels for scan/Jellyfin states)
- [DONE] ~~Re opened after 3rd fix. FIX CAREFULLY. http://dulce.local:3270/library?page=1&tags=p1 show empty resutls but match count is 1 and api probebly works. need to find the row using playwrigth test~~ (verified API+UI parity and added Playwright regression test for `tags=p1` bookmark flow)


- [DONE] ~~BUG RE OPEN card IS NOT fully clickable  (tooltip click now stops card-link navigation;) ~The info tooltip on Dashboard Movies (that is: total movies) card cannot be cliksed as it is already linked. We need a way to link the card as full and also that tool tip. If tool tip is relavent to be moved out then lets do so. deliberate a design.~~ (card body is fully clickable again; tooltip remains independently clickable without forced navigation)

** Disambigation **
- [TODO] Test http://dulce.local:3270/disambiguate against parity with radarr open source code in github. When ready to work on this ask me to rename a live file on disk and we will run disabiute and test (waiting for user to rename a live folder/file to run parity scenario)

**Quality tests**
- [DONE] ~~Scout functional test using a dummy response api mock. get one relaistic for a movie using current prowlar integation I have.~~ (added mock Prowlarr API integration test with realistic movie payload)

### Other Todo Items/Issues 
- [BLOCKED] qBittorrent lockout of IP from accessing.
  - Gating: must retain qBittorrent WebUI security protections; no weakening that compromises exposure over internet (keep host/referrer safeguards effective while making config persistent).
  - Access paths: LAN `http://localhost:3275` or `http://<server-ip>:3275` (or `http://media.local:3275`); public `http://qb.mymedialibrary.example` behind Caddy basic auth; `http://media.local/qb` issues 307 → `:3275`; Cloudflare tunnel via `https://qb.mymedialibrary.example`.
  - Behavior: initial WebUI config (currently HostHeaderValidation=false, LocalHostAuth=false, subnet whitelist on) saves using temporary password from logs, but any later manual changes are lost after container restart; `qBittorrent.conf` looks regenerated and WebUI can return unauthorized without showing login.
  - Log warnings (from `data/qbittorrent/config/qBittorrent/logs/qbittorrent.log`): repeated `WebUI: Invalid Host header, port mismatch ... Received Host header: 'localhost:3275'` and `WebUI: Referer header & Target origin mismatch ... Referer header: 'https://mymedialibrary.example/' ... Target origin: 'qb.mymedialibrary.example'` around restarts.
  - Suspected causes: (1) qBittorrent may be unable to persist later edits because files under `data/qbittorrent/config/qBittorrent/` are owned by `501:20` with 744/644 perms (container runs as PUID/PGID=1000). **Counterpoint:** first-run WebUI changes (using temp admin password) were written successfully, so permission may only break on subsequent runs or after UID/GID changes; needs validation. (2) WebUI security protections might rewrite/lock config back to “known good” when host/referrer warnings fire (invalid host header / referer mismatch), blocking further updates.
  - Caddy path: `qb.mymedialibrary.example` is proxied with basic auth and no header overrides (Host expected to be preserved). Observed warnings: referer mismatch when navigating from `https://mymedialibrary.example` to qb; host-header mismatch when accessing via `localhost:3275`. Need to verify (not yet confirmed) how Host arrives when coming through Cloudflare/HTTPS.
  - Actions taken: enabled `HostHeaderValidation=true`; set `WebUI\ServerDomains=qb.mymedialibrary.example,media.local,localhost,127.0.0.1,::1`; added `Referrer-Policy: no-referrer` header on `mymedialibrary.example` in Caddy to curb referer warnings. `LocalHostAuth` and whitelist are unchanged (LAN-friendly). Some Caddy config still appears to prevent domain validation and blocks are still happening; this may have been when an invalid password was set in Prowlarr. Need to try this again.
