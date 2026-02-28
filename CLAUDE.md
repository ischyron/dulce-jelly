# Agents Guide

## Project
- **Name:** Movie Library / Home Media Lab (Docker media stack + CLI tools)
- **Goal:** Reliable pipeline (download → import → organize → serve) with Jellyfin as the hub; keep UX snappy by keeping app state on SSD and media on HDD.

## Gating Constraints
0) Use a default timeout of 30 seconds for all commands in sandbox and run commands to test, analsye results and learn without active supervision on each command.
1) **Backlog / TODO**: Refer `./TODO.md` at repo root and keep TODO and README updated after every change.
2) **Test**: Always test `test/` after making changes to config like docker config etc. Restart/reload Docker services first so config changes apply.
3) **LAN access:** Prefer direct server IP:port or `<hostname>:port` on LAN; path-based routing deprecated due to each web UI having internal quirks with changes to its webroot.
4) **Public/Cloudflare path:** Must continue to work over Cloudflare Tunnel on `*.yourdomain.example` (routing, auth, UI/API, streaming, WebSockets/SSE). Caddy serves yourdomain.example paths/subdomains; no hostname path prefixes.
5) **Credentials:** Never hardcode creds/defaults in code; use .env/.envrc/config.
5a) **Portable paths:** Never hardcode absolute paths containing a username (e.g. `/Users/haaris/`, `/home/alice/`). Use `$HOME` in shell scripts and `bash -c "$HOME/..."` in JSON configs where tilde expansion is unavailable. This repo must stay reusable across machines and users.
6) **Data mount:** Treat `data/` as mounted state, not code (backup-backed).
7) **Agent workspace**: Use `temp/` directory for work logs, summaries, and temporary analysis files (gitignored).

## Host & Storage
- **Host:** Any system capable of running Docker (tested on macOS/Linux).
- **Storage:** DAS or NAS with primary and backup volumes recommended.
- **SSD paths:** Unified downloads root at `/Volumes/SCRAPFS/downloads` (configurable via `DOWNLOADS_ROOT` env var) shared across SABnzbd, qBittorrent, Radarr, and Sonarr for efficient file handling. Subfolders: `usenet/` (SABnzbd completed), `torrents/` (qBittorrent), `incomplete/` (SABnzbd in-progress).
- **Backups:** Regular backups of data volumes recommended; snapshot support optional.
- **Monitoring:** Use appropriate drive health monitoring tools for your platform.

## Architecture & Services
- **Network:** Single Docker network `media_net`; services talk via container hostnames (not host ports).
- **Services:** Caddy (proxy/landing), Jellyfin, Jellyseerr, Prowlarr, qBittorrent, SABnzbd, Radarr, Sonarr, Recyclarr.
- **Host ports (seq):** 80/443→80/443 (Caddy); 3278/3279→8096/8920 (Jellyfin HTTP/HTTPS); 3277→5055 (Jellyseerr); 3276→9696 (Prowlarr); 3275→8080 (qBittorrent, peers 6881 TCP/UDP); 3274→8080 (SABnzbd); 3273→7878 (Radarr); 3272→8989 (Sonarr); Recyclarr scheduled only.

### Access Patterns
**LAN (no auth):**
- Use direct ports: `http://<server-ip>:3278` (Jellyfin), `:3277` (Jellyseerr), `:3275` (qBittorrent), `:3276` (Prowlarr), `:3273` (Radarr), `:3272` (Sonarr), `:3274` (SABnzbd).

**Internet (Cloudflare Tunnel - basic auth required except Jellyfin):**
- Landing: `http://yourdomain.example`
- Services: Subdomain-based - `http://<service>.yourdomain.example`
  - Jellyfin: `http://jellyfin.yourdomain.example` (auth optional via `JELLYFIN_AUTH_ENABLED` env var, default: false)
  - Jellyseerr: `http://jellyseerr.yourdomain.example` (auth required)
  - qBittorrent: `http://qb.yourdomain.example` (auth required)
  - Radarr: `http://radarr.yourdomain.example` (auth required)
  - Sonarr: `http://sonarr.yourdomain.example` (auth required)
  - SABnzbd: `http://sab.yourdomain.example` (auth required)
  - Prowlarr: `http://prowlarr.yourdomain.example` (auth required)

**Direct port access (setup/troubleshooting):**
- Use when path-based proxying has issues (e.g., Jellyseerr initial setup)
- Format: `http://localhost:<port>` or `http://<host-ip>:<port>`
- See host ports table above for port numbers
- **TLS/proxy:** Caddy is HTTP-only now; enable TLS later (mkcert/Cloudflare). Cloudflare Tunnel config in `cloudflared/`.
- **Volumes (under `data/`):** Jellyfin `jellyfin/{config,cache}`; Jellyseerr `jellyseerr/{config,cache}`; qBittorrent `qbittorrent/config`; Prowlarr `prowlarr/config`; SABnzbd `sabnzbd/config`; Radarr `radarr/config`; Sonarr `sonarr/config`; Recyclarr `recyclarr/config`; Caddy `caddy/{config,data}`; media at `media/` (bind to real library path). Unified downloads root (`DOWNLOADS_ROOT`) mounted to all download clients and *arr apps at `/downloads`.
- **Access patterns:** LAN uses direct IP:port; public path stays `http://<service>.yourdomain.example` with existing auth rules. Path prefixes on hostnames are disabled to avoid app UI redirects.

## Networking & Defaults
- **LAN names (mDNS/hosts):** Direct IP:port is the reliable path; mDNS hostnames may exist but are not required.
- **Env defaults:** `TZ=<your-timezone>`, `PUID=1000`, `PGID=1000`; `JELLYFIN_HTTP_PORT=3278`, `JELLYFIN_HTTPS_PORT=3279` (only if Jellyfin terminates TLS), `JELLYSEERR_PORT=3277`, `QBITTORRENT_WEB_PORT=3275`, `QBITTORRENT_PEER_PORT=6881`, `UMASK_SET=002`, `PROWLARR_PORT=3276`, `SABNZBD_PORT=3274`, `DOWNLOADS_ROOT=/Volumes/SCRAPFS/downloads`, `INCOMPLETE_ROOT=/Volumes/SCRAPFS/downloads/incomplete`, `RADARR_PORT=3273`, `SONARR_PORT=3272`, `RECYCLARR_CRON="0 4 * * *"`.
- **App settings (inside containers):** SABnzbd completed folder: `/downloads/usenet`; qBittorrent save path: `/downloads/torrents`; Radarr/Sonarr download client remote paths match these container paths for atomic moves.
- **Integration tips:** Inside Docker, use hostnames (e.g., `qbittorrent:8080`) for Radarr/Sonarr/Jellyseerr. Credentials come from `.env` (`ADMIN_USERNAME`/`ADMIN_PASSWORD`).
- **TLS note:** Keep 3279/8920 only if Jellyfin terminates TLS; otherwise proxy handles TLS on HTTP upstream.
- **Hardware accel:** Not enabled by default in Jellyfin; add device mappings per host GPU if needed.

## Operations
- **Start stack:** `docker compose up -d` (ensure TZ/PUID/PGID/ports via `.envrc` or exports).
- **Smoke test:** `node --test test/test-services.test.mjs` (set `AUTH_USER`/`AUTH_PASS`, `HOST_IP` if not 127.0.0.1). Tests avoid redirect follow and enforce per-request timeouts.
- **Security:** Keep peer/admin ports firewalled; prefer WireGuard/Tailscale for remote access; add TLS+SSO before exposure.
- **LAN routing:** No hostname path prefixes; use direct IP:port on LAN. Keep yourdomain.example paths/subdomains working.

## Tooling (Python CLIs)
- **Purpose:** Use Jellyfin metadata (not filenames) to find <720p, high-rated movies; cross-check YTS; no downloading.
- **Artifacts:** `data/jf_lowres_rt.csv`, `data/yts_lowq.csv` under repo `data/`.
- **Env (via `.envrc`, not CLI flags):** `JELLYFIN_BASE_URL`, `JELLYFIN_API_KEY`, `YTS_API_BASE` (comma-separated mirrors; defaults prioritize `https://www.yts-official.to/api/v2`). Do not add CLI flags for these basics.
- **Jellyfin command:** `python -m cli jellyfin [--min-rt 6] [--max-height 719] [--verbose]` → `data/jf_lowres_rt.csv`; `--min-rt` ≤10 treated as 10-point scale; default max-height 719 (<720p).
- **YTS command:** `python -m cli yts-jf [--from-csv data/jf_lowres_rt.csv] [--timeout 12 --retries 3 --slow-after 9 --verbose]` → `data/yts_lowq.csv`; prefer IMDb ID, fallback title+year; adds `magnet` column.
- **Schemas:** `jf_lowres_rt.csv` → `name,year,critic_rating,critic_summary,max_height,jellyfin_id,imdb_id,tmdb_id`; `yts_lowq.csv` appends `yts_title,yts_year,yts_url,yts_quality_available,yts_next_quality,magnet`.
- **Heuristics:** Avoid filename heuristics; trust Jellyfin metadata + IMDb IDs; low-quality threshold `max_height <= 719`.
- **Operational:** Agents may run docker logs/restart/ps for this stack when relevant.

## Timeouts & Reliability
- Default request timeout 12s; slow threshold 9s; 3 retries with backoff; switch mirrors on DNS errors.
- Long runs: wrap with wall-clock timeout (e.g., `timeout 300s python -m cli yts-jf --verbose` or platform-specific timeout command).

## Design Principles to Preserve
- Prefer direct IP:port on LAN; maintain public yourdomain.example paths/subdomains.
- Prefer base-URL settings over ad-hoc proxy rewrites; keep LAN + public working.
- Non-root containers via PUID/PGID; keep peer/admin ports firewalled.
- Maintainability: README stays high-level; this file is authoritative for defaults/heuristics; keep setup in env/checked config, not new CLI flags.

## Repository Structure (Monorepo)

The repository uses npm workspaces and Turborepo for monorepo management:

```
dulce-jelly/
├── packages/              # Workspace packages
│   ├── ms-cli/           # TypeScript CLI (CORE - required)
│   ├── quality-broker/   # LLM quality broker (OPTIONAL)
│   └── infra-setup/      # Infrastructure setup (OPTIONAL)
├── apps/                 # Application packages
│   └── cloudflare/       # Pulumi IaC for Cloudflare (OPTIONAL)
├── turbo.json            # Turborepo pipeline config
└── package.json          # Root workspace config
```

### Build System
- **Tool:** Turborepo with npm workspaces
- **Build all:** `npm run build` (builds all packages with caching)
- **Build core:** `npm run build:core` (ms-cli only)
- **Build optional:** `npm run build:optional` (quality-broker, infra-setup)
- **Lint:** `npm run lint` (lints all packages)
- **Cache:** Turbo automatically caches build outputs for speed

### Package Status
- **ms-cli** (packages/ms-cli): TypeScript CLI - CORE/REQUIRED
- **quality-broker** (packages/quality-broker): TypeScript - OPTIONAL
- **infra-setup** (packages/infra-setup): TypeScript - OPTIONAL
- **cloudflare** (apps/cloudflare): Pulumi TypeScript - OPTIONAL

Optional packages are not required for core media stack operation.

## Architecture Diagram
- Source: `docs/architecture.mmd` (Mermaid).
- Render (requires mermaid-cli): `npx -y @mermaid-js/mermaid-cli -i docs/architecture.mmd -o docs/architecture.png` (network/install step; may take time).
- Intended PNG path: `docs/architecture.png` (link from README).

## Clients
- Primary usage: TV clients (Android TV, Google TV, etc.)
- Mobile apps for token/quick access
- Optional public internet access through cloudflared

## Assistant Behavior
- Keep responses concise; prefer server-side fixes; ask for smallest snippets when needed.
- Do not invent citations; use tables for comparisons by default unless asked otherwise.

## Agent Workspace

All agent work artifacts must be placed in the `temp/` directory at the repository root (see constraint #7).

**Why:**
- ✅ Keeps working files separate from project code
- ✅ Prevents accidental commits of work logs
- ✅ Easy cleanup (`rm -rf temp/`)
- ✅ `.gitignore` excludes this directory
- ✅ Standardized location for human review

### Directory Structure

```
<project-root>/
├── temp/                           # Agent workspace (gitignored)
│   ├── session-summary.md          # Latest session summary
│   ├── work-log.md                 # Session work log
│   └── *.md                        # Any other temporary files
└── ... (rest of project)
```

### When to Use `temp/`

**✅ Always Use for:**
1. **Session Summaries** - High-level summary of work completed (`session-summary.md`)
2. **Work Logs** - Detailed logs of actions taken during session (`work-log.md`)
3. **Analysis Outputs** - Code analysis, complexity reports, dependency graphs
4. **Research Notes** - Findings from exploring codebase/documentation
5. **Scratch Files** - Temporary calculations, drafts, experiments
6. **Command Outputs** - Large command outputs that need review

**❌ Never Use for:**
1. **Project Documentation** - Goes in appropriate doc directories
2. **Source Code** - Goes in appropriate source directories
3. **Configuration** - Goes in project config locations
4. **Test Files** - Goes in test directories
5. **Assets** - Goes in appropriate asset directories

### File Naming Conventions

**Standard Files:**
- `temp/session-summary.md` - Latest session summary (overwrite)
- `temp/work-log.md` - Latest work log (overwrite)

**Additional Files:** Use descriptive names with context (e.g., `temp/complexity-report.md`, `temp/pulumi-analysis.md`)

### Work Log Template

```markdown
# Work Log - [Date/Time]

## Session Goal
[What you're trying to accomplish]

## Actions Taken

### 1. [Action Category]
- **What:** [Description]
- **Why:** [Rationale]
- **Result:** [Outcome]
- **Files Modified:** [List]

## Issues Encountered
- [Issue description]
  - **Impact:** [High/Medium/Low]
  - **Resolution:** [How fixed or workaround]

## Decisions Made
- **Decision:** [What was decided]
- **Rationale:** [Why]
- **Alternatives Considered:** [What else was considered]

## Next Steps
1. [Next action item]

## Commands Run
[List of significant commands with results]

## Files Changed
- `path/to/file.ext` - [Brief description of changes]
```

### Session Summary Template

```markdown
# Session Summary - [Date]

## Overview
[1-2 paragraph summary of what was accomplished]

## Changes Made

### Infrastructure
- [Change 1]

### Documentation
- [Change 1]

## Files Modified
- `file1.ext` - [Purpose]

## Testing Status
- [x] Manual testing completed
- [ ] Automated tests need updating

## Known Issues
- [Issue 1] - [Status/workaround]

## Recommendations
1. [Recommendation for user]
```

### Agent Workflow

**Start of Session:**
1. Create work log: `mkdir -p temp && touch temp/work-log.md`
2. Document session goal in work log
3. Check for previous summary: `cat temp/session-summary.md 2>/dev/null`

**During Session:**
1. Log significant actions to work log in real-time
2. Capture large command outputs to temp: `some-command > temp/command-output.txt`
3. Create analysis files as needed

**End of Session:**
1. Create session summary using template
2. Review work log for completeness
3. Inform user where to find summary

### Best Practices

**Do:**
- ✅ Use temp/ for all working files
- ✅ Create timestamped logs
- ✅ Write clear summaries
- ✅ Document decisions and rationale
- ✅ Capture command outputs if large

**Don't:**
- ❌ Commit temp/ to git (it's gitignored)
- ❌ Put project documentation in temp/
- ❌ Auto-delete without user consent
- ❌ Reference temp/ files in project docs
- ❌ Store sensitive data without warning user

### Cleanup

Users can clean up the temp directory at any time: `rm -rf temp/`

Agents should NOT auto-delete temp files. Users may want to review them.

## Authoring Guardrails (Agents & Contributors)

This section provides **writing and documentation guardrails** for agents and
contributors. It is an internal authoring standard, not a legal policy.

### Core Principle
Write as an **infrastructure engineer**, not as a content guide.

This project documents:
- service orchestration
- integration and configuration
- storage, metadata, and reliability patterns

It does **not** document where content comes from or how to acquire it.

### PR Language Self-Check
Before opening or approving a PR:

- [ ] Uses neutral technical terms (manage, integrate, process, import)
- [ ] Avoids intent-loaded verbs (download movies, grab content, free, request titles)
- [ ] Describes system behavior, not user motivation
- [ ] Uses generic filenames and placeholders only
- [ ] Contains no real movie/TV titles, trackers, or source URLs
- [ ] Includes no step-by-step acquisition flows
- [ ] Keeps comments focused on mechanics, not outcomes

### Dual-Use Awareness
Some third-party tools referenced here are capable of retrieving files from
user-configured sources.

When documenting such tools:
- describe **capability**, not common usage
- avoid content discovery or sourcing language
- omit copyrighted works from examples

All configuration decisions are user-controlled.

### Agent-Specific Rules
When generating or modifying content:
- default to neutral infrastructure language
- avoid examples unless explicitly requested
- omit rather than speculate when unsure
- never introduce copyrighted titles or sources

If a request drifts toward acquisition guidance:
- reframe toward configuration or organization
- do not expand scope
