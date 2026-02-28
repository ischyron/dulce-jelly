---
name: maintaining-dulce-jelly
description: Maintain and upgrade the DulceJelly media stack (Docker, *arr, Recyclarr/TRaSH, Quality Broker, infra, and TypeScript tooling).
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Task
---

# Maintaining DulceJelly

## Session Start Protocol

Always do this before touching anything:

```
1. Read TODO.md — contains blocked items and active human feedback
2. git status — understand what's already in flight
3. Clarify scope if the request touches a BLOCKED item in TODO.md
```

---

## Tool Selection Guide

| What you want to do | Use |
|---|---|
| Query or write to Radarr/Sonarr | Bash → `curl -H "X-Api-Key: $RADARR_API_KEY" http://localhost:3273/api/v3/...` |
| Stack health, logs, restarts | `ms status`, `ms logs <alias>`, `ms restart <alias>` |
| Quality profile sync | `ms sync` |
| Run Quality Broker | `ms qb-run -- [flags]` |
| Docker config change | Edit compose/env → `ms restart <svc>` → `ms test` |
| TypeScript changes | Edit → `npm run build` → `ms test` |

---

## Service Directory

| Service | Host Port | ms alias | Internal host | ms log cmd |
|---|---|---|---|---|
| Jellyfin | 3278 | `jf` | `jellyfin:8096` | `ms logs jf` |
| Jellyseerr | 3277 | `js` | `jellyseerr:5055` | `ms logs js` |
| Prowlarr | 3276 | `pr` | `prowlarr:9696` | `ms logs pr` |
| qBittorrent | 3275 | `qb` | `qbittorrent:8080` | `ms logs qb` |
| SABnzbd | 3274 | `sb` | `sabnzbd:8080` | `ms logs sb` |
| Radarr | 3273 | `ra` | `radarr:7878` | `ms logs ra` |
| Sonarr | 3272 | `so` | `sonarr:8989` | `ms logs so` |
| Huntarr | 3271 | `ht` | `huntarr:9705` | `ms logs ht` |
| Caddy | 80/443 | `ca` | — | `ms logs ca` |
| Cloudflared | — | `cf` | — | `ms logs cf` |
| Recyclarr | — | `rc` | — | `ms logs rc` |
| FlareSolverr | — | `fs` | `flaresolverr:8191` | `ms logs fs` |

LAN access: `http://<server-ip>:<port>`. Never path-based routing on LAN.

---

## Standard Workflows

**Config change (any service):**
```
Edit compose/env/config → ms restart <svc> → ms test
```

**Quality profile change:**
```
Edit packages/quality-broker/config/recyclarr-sample/includes/radarr-quality-profiles.yml
→ ms sync → ms test
```

**Recyclarr only (no quality-broker change):**
```
Edit data/recyclarr/config/ → ms sync → ms logs rc
```

**TypeScript CLI change:**
```
Edit packages/ms-cli/src/ → npm run build:core → ms test
```

**Quality Broker change:**
```
Edit data/quality-broker/config/config.yaml
→ ms qb-run -- --dry-run --batch-size 5   (preview first)
→ ms qb-run -- --batch-size 10            (apply)
→ ms qb-log                                (verify log)
```

**Cloudflare routing change:**
```
Edit cloudflared/config.yml → Edit caddy/Caddyfile
→ ms reload tunnel → ms reload caddy → ms test
```

---

## Quality Broker

Custom deterministic-first Radarr profile assigner. Source: `packages/quality-broker/`.

**Run modes:**

| Flag | Effect |
|---|---|
| _(none)_ | Process only movies in `autoAssignProfile` queue |
| `--dry-run` | Compute and print decisions; no Radarr changes |
| `--ignore-autoflag` | Scan all Radarr movies, not just the intake queue |
| `--batch-size N` | Limit processing to N movies per run |

**Config:** `data/quality-broker/config/config.yaml`
**Logs:** `data/quality-broker/logs/*.json`
**Status:** `data/quality-broker/status/last-run.json`

Key config fields:
- `autoAssignProfile` — intake queue profile name (must exist in Radarr)
- `ignoredProfilesFromChanges` — profiles never touched (default: `DontUpgrade`)
- `decisionProfiles` — target profiles the broker can assign
- `policyForAmbiguousCases.useLLM` — enable LLM fallback (requires `openai.apiKey`)

Broker reads Radarr profile list at runtime; **refuses to run if target profiles are missing**.

---

## Recyclarr / TRaSH

- Config layout: **v8+** — `includes/` must be siblings to `configs/`, not inside it.
- Profiles pushed by Recyclarr must match broker `decisionProfiles` names exactly.
- Quality deviations from TRaSH defaults are documented in `docs/quality-profile.md`.
- LQ penalty is softened (-10/-15, not -10000) to allow compact sources when premium unavailable.
- Remux is blocked by size caps + CF score -1000.

---

## Known Gotchas

**qBittorrent config persistence:** First-run WebUI changes save correctly; subsequent edits after restart may be silently discarded. When troubleshooting access issues, check `data/qbittorrent/config/qBittorrent/` ownership matches PUID/PGID (default 1000:1000). Don't delete config without asking — state is in `data/`. See TODO.md for full context on the BLOCKED item.

**PUID/PGID mismatch:** If containers start but can't write to `data/`, ownership on the host `data/` tree is wrong. Fix ownership, don't chmod 777.

**Recyclarr v8 layout:** If sync fails with "include not found", check that `includes/` is a sibling to `configs/` — not nested inside it.

**Neutral language:** All code comments, docs, and commit messages must describe infrastructure behavior, not content acquisition. See CLAUDE.md → Authoring Guardrails before opening a PR.

**Never hardcode credentials:** Secrets come from `.env`, `data/` mounted config, or Pulumi secrets only.

---

## Before Marking Done

- [ ] `ms test` passes (or explain why it can't run)
- [ ] `TODO.md` updated if behavior changed or a TODO was resolved
- [ ] Relevant doc updated if a new pattern or config was introduced
- [ ] No credentials or real titles introduced in code/docs
- [ ] No hardcoded absolute paths with usernames (use `$HOME` / `bash -c "$HOME/..."` — see CLAUDE.md §5a)

---

## Reference Files

| File | Purpose |
|---|---|
| [CLAUDE.md](../../../CLAUDE.md) | Authoritative constraints, defaults, env vars |
| [TODO.md](../../../TODO.md) | Active tasks and blocked items — read first |
| [docs/quality-profile.md](../../../docs/quality-profile.md) | TRaSH deviations, size caps, CF scores |
| [docs/quality-broker.md](../../../docs/quality-broker.md) | Broker config reference |
| [docs/ms-cli.md](../../../docs/ms-cli.md) | All ms commands |
| [docs/troubleshooting.md](../../../docs/troubleshooting.md) | Common failure patterns |
| [docs/service-setup-guide.md](../../../docs/service-setup-guide.md) | Port table, first-run setup |
