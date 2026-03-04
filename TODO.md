# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Always read the TODO from disk, as the human keeps this updated and the latest status and feedback on tasks are important.
- Work through todos independently; pause only if human review is required.
- Strike out when done/blocked.
- Don't create new sections for TODOs or bugs. Keep status inline.
- After feature/fix complete, deploy it on docker 

### Curatarr Backlog

- [DONE] ~~bug http://dulce.local:3270/library?tags=p1&page=1 filetr by tag doesnt work~~ (verified working on live API/UI)
- [DONE] ~~Score in Scout page need a tooltip like CRITIC column in libary. Need to inform user what is this score based on IMDB or a an internal logic. Look at Ground truth - analsye code how this is scored~~
- [DONE] ~~Show ALL feature where pagination is removed and all items are shown. Let user take the risk~~

**CF scoring, Rules, Scout**

- [DONE] ~~Scout feature:  CF scoring . Currently user cant score high a partuclar relese group or a format external to the inbut scoring added.~~
- [DONE] ~~TODO and bit rate settings, decide an optioimal one - look at my settings and relax it even further. and set this as a default. Configure into an external file.~~
eg: Yaml scoring.yaml maintain the config here (if need t be synced to db - do that but main source of truth will be this packages/curatarr/config. Now config is empty see why ?????? )
llm:
  apiKey: ${OPENAI_API_KEY} llm provider needed here
  For now ork with just open ai (hard code in UI and disable that input and wirte same to config)
  
- [DONE] ~~Update Document apporoch on Scout in packages/curatarr/docs and link to README.~~

** Disambigation **
- [DONE] ~~Currently disambigation is not so good apart from Jellyfin title mismatch. Need to study and document radarr disambigation done against title of the name and parsed title from filename. Lets make this more robust. I am sure in  libary I have many items for disambigation eg: Les MIsrables etc. Find it and surface a list of actions under this route http://dulce.local:3270/disambiguate~~

**Quality tests**
 - [TODO]  MPEG-4 legacy codec files — surface in Scout Queue for replacement recommendations. USe an apporoch, splice it into current priority apporch. dont over rank the legacy codec, but make sure they are not lost/buried in last page of scout queue. if current apprch is reaosble then dont do anything. 
- [DONE] ~~USe Chrome MCP Verify page: run deep-check on 2-3 files, evaluate impact and how users can view results. Is this result user-friendly? Is the information useful or too technical. If not, improvise.~~ (API deep-check run done on 3 files; page already includes ffmpeg explanation and condensed failure surfacing)

- [DONE] Prowlarr integration into Scout
- [DONE] Scout feature (like Radarr but not using Radarr): an interactive flow that gives AI-recommended releases, or otherwise tabulate the most efficient path
- [DONE] Scout feature (automatic with batch size configured). Do not accept batch sizes that can overwhelm the indexers.
- [DONE] ~~Playwright smoke tests: update/extend coverage for all pages (Dashboard, Library, Scout, Disambiguate, Verify, Settings, MoviePage). Do exoploratory tests and find bugs and record them -  Chrome MCP exploratory testing from layman user POV — report findings as TODO/BUGS, fix UX issue~~ (17/17 passing)

### Other Todo Items/Issues 
- [BLOCKED] qBittorrent lockout of IP from accessing.
  - Gating: must retain qBittorrent WebUI security protections; no weakening that compromises exposure over internet (keep host/referrer safeguards effective while making config persistent).
  - Access paths: LAN `http://localhost:3275` or `http://<server-ip>:3275` (or `http://media.local:3275`); public `http://qb.mymedialibrary.example` behind Caddy basic auth; `http://media.local/qb` issues 307 → `:3275`; Cloudflare tunnel via `https://qb.mymedialibrary.example`.
  - Behavior: initial WebUI config (currently HostHeaderValidation=false, LocalHostAuth=false, subnet whitelist on) saves using temporary password from logs, but any later manual changes are lost after container restart; `qBittorrent.conf` looks regenerated and WebUI can return unauthorized without showing login.
  - Log warnings (from `data/qbittorrent/config/qBittorrent/logs/qbittorrent.log`): repeated `WebUI: Invalid Host header, port mismatch ... Received Host header: 'localhost:3275'` and `WebUI: Referer header & Target origin mismatch ... Referer header: 'https://mymedialibrary.example/' ... Target origin: 'qb.mymedialibrary.example'` around restarts.
  - Suspected causes: (1) qBittorrent may be unable to persist later edits because files under `data/qbittorrent/config/qBittorrent/` are owned by `501:20` with 744/644 perms (container runs as PUID/PGID=1000). **Counterpoint:** first-run WebUI changes (using temp admin password) were written successfully, so permission may only break on subsequent runs or after UID/GID changes; needs validation. (2) WebUI security protections might rewrite/lock config back to “known good” when host/referrer warnings fire (invalid host header / referer mismatch), blocking further updates.
  - Caddy path: `qb.mymedialibrary.example` is proxied with basic auth and no header overrides (Host expected to be preserved). Observed warnings: referer mismatch when navigating from `https://mymedialibrary.example` to qb; host-header mismatch when accessing via `localhost:3275`. Need to verify (not yet confirmed) how Host arrives when coming through Cloudflare/HTTPS.
  - Actions taken: enabled `HostHeaderValidation=true`; set `WebUI\ServerDomains=qb.mymedialibrary.example,media.local,localhost,127.0.0.1,::1`; added `Referrer-Policy: no-referrer` header on `mymedialibrary.example` in Caddy to curb referer warnings. `LocalHostAuth` and whitelist are unchanged (LAN-friendly). Some Caddy config still appears to prevent domain validation and blocks are still happening; this may have been when an invalid password was set in Prowlarr. Need to try this again.
