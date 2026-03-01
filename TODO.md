# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Work through todos independently; pause only if human review is required.
- Strike out or mark status when done/blocked.

### ~~Curatarr Bug Fixes~~ — ALL FIXED 2026-03-01 (found 2026-03-01 exploratory session)

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| BUG-01 | HIGH | scan route | Scan accepts a path that doesn't exist on disk — starts, walker throws ENOENT, SSE 'error' fires, but `startScanRun` already created an orphaned DB record. Add path-exists check (400) before starting. |
| BUG-02 | HIGH | ScanPage UI | `triggerScan()` and `triggerSync()` have no try/catch — 400 (no path), 409 (already running), network errors are silently dropped; user sees nothing. Show inline error. |
| BUG-03 | HIGH | ScanProgressModal | Stop button has zero feedback while awaiting cancel. If scan finished just before cancel, `{cancelled:false}` is returned silently. Add "Stopping…" spinner and handle the already-done case. |
| BUG-04 | HIGH | SseEmitter/scan | `cancel()` does NOT set `running=false` — new scan attempts get 409 "already running" until the worker pool drains (could be 30s+ on large libs). Set `running=false` immediately in `cancel()`. |
| BUG-05 | HIGH | JF sync | No stop button for Jellyfin Sync — `cancelEndpoint` is `null` for sync mode. Add `/api/jf-sync/cancel` route and wire it up in the modal. |
| BUG-06 | HIGH | ScanPage | "Start Scan" button not disabled while scan is running. User can click it repeatedly; all but first silently fail (BUG-02 compounds this). |
| BUG-07 | MEDIUM | verify route | `queued` count in `/api/verify/start` response is wrong — `db.getUnverifiedFiles(1)` returns at most 1 row, so response always shows `queued:1`. Need a COUNT query. |
| BUG-08 | MEDIUM | VerifyPage | `running` local state starts `false` regardless of server state. If user navigates to Verify while verify is in progress, Start button shows and clicking gives 409 with no feedback. Sync from `statusData.running` on mount. |
| BUG-09 | MEDIUM | scan progress | Progress bar never reaches 100% on incremental scans. `foldersTotal=all 1781 folders` but `foldersDone` only counts folders with new files processed. Mismatch means bar stalls at e.g. 5% even when done. |
| BUG-10 | MEDIUM | scan.ts | `db.startScanRun()` is called before `walkLibrary()`. If walker throws (ENOENT), `finishScanRun` is never called → orphaned partial scan_run row in DB. |
| BUG-11 | MEDIUM | SSE error handler | `es.addEventListener('error', ...)` catches BOTH named SSE 'error' events AND native EventSource connection errors. A normal stream close fires a native error → modal shows "Unknown error". Distinguish the two. |
| BUG-12 | LOW | walker | `isMainVideoFile`: line `return true` where comment says "skip" — files with 'sample' in the middle (e.g. `movie.sample.mkv`) are incorrectly included. Should be `return false`. |
| BUG-13 | LOW | Dashboard | Empty state: fresh install shows all 0s with no guidance. Add onboarding banner when `totalMovies === 0`. |

### Curatarr Backlog

- [TODO] Playwright smoke tests across all pages (Dashboard, Library, Scout, Disambiguate, Verify, Settings, MoviePage)
- [TODO] JF enrichment coverage: 283/1781 (15.9%) — investigate remaining 1498 unmatched; consider path rematch after jf-sync
- [TODO] 3 AV1 files detected — verify which movies and check against client profile
- [TODO] 17 mpeg4 legacy codec files — surface in Scout Queue for replacement
- [TODO] Movie page: add poster image via TMDb API (tmdb_id is stored, just needs a fetch)
- [TODO] Library list: add "open full page" row action (⬡ icon or Ctrl+click) as alternative to drawer
- [TODO] Disambiguation: run full batch via UI for all unsynced movies
- [TODO] Verify page: run deep-check on all 1787 files (CPU-intensive, run off-peak)

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
