# Media Server Short CLI (`ms`)

Short, pronounceable commands to run the media stack without typing long Docker or Recyclarr incantations. TypeScript CLI built from `packages/ms-cli/` and uses Docker + Node you already have.

## Quick Start

- Add to PATH: `export PATH="$PWD/bin:$PATH"` then use `ms <command>` (macOS: add to `~/.zshrc`)
- Or run via npm: `npm run ms -- <cmd>` (from repo root)
- Or run directly: `./bin/ms <cmd>`

## Commands (at a glance)

- `ms up` — Start stack (`docker compose up -d`).
- `ms down` — Stop stack (`docker compose down`).
- `ms status` — Show container status/health.
- `ms logs [svc]` — Tail logs for a service (`jf|js|qb|ra|so|pr|sb|ca|cf|rc`) or all services when omitted.
- `ms restart <svc>` — Soft restart a service.
- `ms reload caddy` — Graceful Caddy reload.
- `ms reload tunnel` — Restart cloudflared.
- `ms sync` — Recyclarr sync for Radarr+Sonarr together (one quality set).
- `ms test` — `node --env-file=.env --test test/test-services.test.mjs` using `.env` auth values.
- `ms env` — Show key env values (TZ/PUID/PGID/auth flags/paths).
- `ms ports` — LAN ports + Cloudflare hostnames.
- `ms mounts` — Check required host paths exist/writable.
- `ms health` — Summarize container health.

## Tips

- Works from any cwd; commands run inside the repo root.
- Keep `.env` populated so `ms test` and env-dependent commands have what they need.
- After config tweaks: `ms sync` then `ms test` to confirm.

## Development

The ms CLI is written in TypeScript:
- Source: `packages/ms-cli/src/`
- Build: `npm run build` or `npm run build:core`
- Lint: `npm run lint`
- Output: `packages/ms-cli/dist/`
