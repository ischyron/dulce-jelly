# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Work through todos independently; pause only if human review is required.
- Strike out when done/blocked. D
- Dont create new sections for todo or bugs. keep status inline.

### Curatarr Backlog

- [TODO] BUG-14 HIGH | Release group missing for many titles — visible in filename but not parsed (e.g. "Drug War"). Investigate release group extraction regex in scanner. Approch refinement copy edgecase and how radarr handles release names etc from file patterns like "Release group extraction from filename". copy same apporoch from radarr github and implemement same way for feature parity
- [TODO] BUG-15 HIGH | MC (Metacritic) and IMDb scores empty in Library/ScoutQueue — JF sync enrichment at 15.9% (283/1781). Also: RT (Rotten Tomatoes) score column missing — need fresh/rotten icons, sourced from Jellyfin CriticRating or JF provider data.
- [TODO] BUG-16 MEDIUM | Deep check error tooltip/popup cropped when shown on a Search result row — CSS overflow clipping issue in table container.
- [TODO] BUG: Numbers in libary search doesnt work eg: "500" doesnt list 500 days of summer
- [TODO] Poster images: add `/api/proxy/image/:jellyfinId` endpoint; show poster in MovieDetailDrawer and MoviePage. Proxy via Curatarr server (no duplicate storage, no public Jellyfin URL needed, works in all topologies)
- [TODO] Default sort order should be base don title if none specified. Clciking libary menu from left tab should preseve last view (filter and sort combination) -So we provide a "reset view" at top for user to start over.
- [TODO] JF enrichment need only bare minimum feilds like score, genere, title, etc which are needed for curation. poster, plot etc can live in jellyfin. plot and descrption are not needed.
- [TODO] JF enrichment scheduling config: make sure this runs automatically evey 30 min and batch size 10. schedule and batch configired in Settings. 
- [TODO] JF enrichment BUG: This is also buggy now. example:  Les Misérables (1998) (2019) → Les Misérables (2012) (2012)[year_mismatch]. the out put is not clear. "Les Misérables (1998)" fodler name to ne highlishted and whay is conflciing then "Les Misérables (2012)" this is another movie but of different year. The 2012 movie =of same name has fodler name, filename, and real meta data all matching. So issue you found is tru but applies only to folder "Les Misérables (1998)". Say [year_mismatch] path: "Les Misérables (1998)/Les.Misérables.2019.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4" in issue line item. May be highlight year in the string on filename and foldername and jellyfin:<year>.
- [TODO] Playwright smoke tests: update/extend to cover all pages (Dashboard, Library, Scout, Disambiguate, Verify, Settings, MoviePage) — 22 pass currently
- [TODO] 3 AV1 files — identify which movies, surface in Library with client profile compat warning
- [TODO] 17 mpeg4 legacy codec files — surface in Scout Queue for replacement recommendations
- [TODO] Disambiguation: repriduct bugs by may be manmually remove some titles from libary (Curatarr WILL NOT have hard delete option) and test if Disambiguation works
- [TODO] Verify page: run deep-check on all 2-3 files see how impact is and how user can see results. IS this result frindly. is popup working. if not improvise.
- [TODO] dist-ui need to be git ignored within packages/curatarr/.gitignore
- [TODO] Jellyfin ID is useless for users of the curatarr, lets not show in UI (keep in backened as it is needed)
- [TODO] Escape key should close the detail pane open when in library
- [TODO] Resolution Distribution in dashboard the labels are overlapping. May be change layout of this widget and show % next to the label/legend 
- Scout features: 
- [TODO] Scout feature: Trash guide synced into Sout configuration in settings. Fina a way for users to keep syncing lik recylarr sync, re-use recylarr if thats th ebest approch. recylarr would  only add sonarr/radarr as config patterns in thier config. So if recylarr is simple to implment - lets plug that into curatarr
- [TODO] CF scoring and bit rate settings
- [TODO] Prowlarr integration into Scout
- [TODO] Scout feature (like radarr but not using radarr): interactive one that gives AI recommended releases - or just tablutate the most efficient way otherwise
- [TODO] Scout feature (Automatic with batch size configured). DOn not accept batch sizes that can overwhelm the indexers.
- [TODO] Chrome MCP exploratory testing from layman user POV — report findings, fix UX issues
### Other Todo Items/Issues
- [BLOCKED] qBittorrent lockout of IP from accessing.
  - Gating: must retain qBittorrent WebUI security protections; no weakening that compromises exposure over internet (keep host/referrer safeguards effective while making config persistent).
  - Access paths: LAN `http://localhost:3275` or `http://<server-ip>:3275` (or `http://media.local:3275`); public `http://qb.mymedialibrary.example` behind Caddy basic auth; `http://media.local/qb` issues 307 → `:3275`; Cloudflare tunnel via `https://qb.mymedialibrary.example`.
  - Behavior: initial WebUI config (currently HostHeaderValidation=false, LocalHostAuth=false, subnet whitelist on) saves using temporary password from logs, but any later manual changes are lost after container restart; `qBittorrent.conf` looks regenerated and WebUI can return unauthorized without showing login.
  - Log warnings (from `data/qbittorrent/config/qBittorrent/logs/qbittorrent.log`): repeated `WebUI: Invalid Host header, port mismatch ... Received Host header: 'localhost:3275'` and `WebUI: Referer header & Target origin mismatch ... Referer header: 'https://mymedialibrary.example/' ... Target origin: 'qb.mymedialibrary.example'` around restarts.
  - Suspected causes: (1) qBittorrent may be unable to persist later edits because files under `data/qbittorrent/config/qBittorrent/` are owned by `501:20` with 744/644 perms (container runs as PUID/PGID=1000). **Counterpoint:** first-run WebUI changes (using temp admin password) were written successfully, so permission may only break on subsequent runs or after UID/GID changes; needs validation. (2) WebUI security protections might rewrite/lock config back to “known good” when host/referrer warnings fire (invalid host header / referer mismatch), blocking further updates.
  - Caddy path: `qb.mymedialibrary.example` is proxied with basic auth and no header overrides (Host expected to be preserved). Observed warnings: referer mismatch when navigating from `https://mymedialibrary.example` to qb; host-header mismatch when accessing via `localhost:3275`. Need to verify (not yet confirmed) how Host arrives when coming through Cloudflare/HTTPS.
  - Actions taken: enabled `HostHeaderValidation=true`; set `WebUI\ServerDomains=qb.mymedialibrary.example,media.local,localhost,127.0.0.1,::1`; added `Referrer-Policy: no-referrer` header on `mymedialibrary.example` in Caddy to curb referer warnings. `LocalHostAuth` and whitelist unchanged (LAN-friendly). No matter some caddy config still prevents domain validation and blocks were happenings - this is perpahs at the time an invalid password was in prowlaar. Need to try this again.
