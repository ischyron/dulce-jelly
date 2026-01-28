---
name: maintaining-dulce-jelly
description: Maintain and upgrade the DulceJelly media stack (Docker, *arr, Recyclarr/TRaSH, Quality Broker, infra, and TypeScript tooling).
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Maintaining DulceJelly

Skill for maintaining and upgrading the DulceJelly Docker media stack. Use this when making changes to Docker services, quality profiles, infrastructure, or TypeScript tooling.

## Key Guidelines

1. **Always validate changes**: Run `ms test` after config changes; restart services first
2. **Keep docs in sync**: Update `TODO.md` and `README.md` when behavior changes
3. **Use neutral language**: Describe infrastructure, not content acquisition
4. **No hardcoded secrets**: Use `.env`, Pulumi secrets, or mounted config
5. **LAN uses direct ports**: `http://<ip>:<port>`, never path-based routing

## Responsibilities

| Area | Scope |
|------|-------|
| Docker stack | Compose, ports, volumes, health, logs |
| Network routing | LAN IP:port access, subdomain-based public routing |
| Quality profiles | Recyclarr/TRaSH sync, Radarr/Sonarr profiles |
| Quality Broker | Scoring weights, rule alignment with profiles |
| Infrastructure | Caddy, Cloudflare Tunnel, Pulumi |
| TypeScript tooling | ms-cli, quality-broker, infra-setup |

## Workflow

```
1. Read CLAUDE.md + README.md (constraints/defaults)
     ↓
2. Make changes
     ↓
3. Restart affected services: ms restart <svc>
     ↓
4. Validate: ms test (or node --test test/test-services.test.mjs)
     ↓
5. Update TODO.md and docs if behavior changed
```

## Quick Commands

| Task | Command |
|------|---------|
| Stack status | `ms status` |
| View logs | `ms logs <svc>` (jf\|js\|qb\|ra\|so\|pr\|sb\|ca\|cf\|rc) |
| Restart service | `ms restart <svc>` |
| Sync quality profiles | `ms sync` |
| Run tests | `ms test` |
| Health check | `ms doctor` |

## Domain Knowledge

**Recyclarr / TRaSH**:
- Includes must be siblings to `configs/` (v8+ layout)
- Quality Broker targets must match Recyclarr profile names
- See `docs/quality-profile.md` for size caps and CF scoring

**TypeScript**:
- Build: `npm run build` (Turborepo)
- Lint: `npm run lint`
- ms-cli source: `packages/ms-cli/src/`

**Paths**:
- Config state: `data/` (treat as mounted, not code)
- Downloads: `$DOWNLOADS_ROOT` (default `/Volumes/SCRAPFS/downloads`)
- Recyclarr config: `data/recyclarr/config/`

## Reference Files

- [CLAUDE.md](../../../CLAUDE.md) — Project constraints
- [README.md](../../../README.md) — Setup and access
- [docs/quality-profile.md](../../../docs/quality-profile.md) — Quality settings
- [docs/quality-broker.md](../../../docs/quality-broker.md) — Broker config
- [docs/ms-cli.md](../../../docs/ms-cli.md) — CLI commands
- [docs/troubleshooting.md](../../../docs/troubleshooting.md) — Common issues

## Examples

**Adjust Radarr size caps**:
1. Edit `packages/quality-broker/config/recyclarr-sample/includes/radarr-quality-profiles.yml`
2. Run `ms sync` to push to Radarr
3. Run `ms test` to validate

**Update Cloudflare tunnel hostname**:
1. Edit `cloudflared/config.yml` ingress rules
2. Update corresponding Caddy routes in `caddy/Caddyfile`
3. Run `ms reload tunnel && ms reload caddy`

**Modify Quality Broker scoring**:
1. Edit `data/quality-broker/config/config.yaml` weights/thresholds
2. Verify target profiles exist in Radarr: `ms qb-run -- --batch-size 1`
3. Check logs: `ms qb-log`
