# Curatarr Notes

This file provides project context. Execution workflow policy is defined in `AGENTS.md`.
For task completion rules and feature gating, follow `packages/curatarr/AGENTS.md`.

## Execution Contract

- `AGENTS.md` is canonical for Definition of Done and gate enforcement.
- Do not treat roadmap/spec prose as completion evidence.
- Completion requires runnable proof (tests, e2e, manual verification, git, deploy) recorded in TODO.
- If a required gate cannot run, status must be `BLOCKED` or `IN-PROGRESS`, not `DONE`.

## Validation Stack (Reference)

- Unit/interaction: `npm run test`
- E2E: `npm run test:e2e`
- Manual verification: Chrome MCP for UI/user-visible API behavior changes
- MCP preflight: `codex mcp list` (must include enabled `playwright` and `chrome`)
- Docker deploy/restart commands must run from project root relative to `packages/curatarr`: `../../`
- Deploy: `cd ../../ && docker compose build curatarr && docker compose up -d curatarr`
- Restart/update shortcut: `cd ../../ && docker compose up -d --build curatarr`

## Project Overview

Curatarr is a privately developed media curation tool, pending open-source release, currently being tested as one package in a parent monorepo.
It focuses on movie library quality workflows and integrates with Jellyfin and Prowlarr.

## Current Reality (Code-First)

- Runtime is active: CLI + Hono API + React UI + SQLite.
- Implemented areas include scan, Jellyfin sync, verify, disambiguation, scout queue/search, and settings.
- Many long-form roadmap docs describe future direction; always verify behavior against implemented code.

## Source of Truth Order

1. Running code in `src/`
2. Tests in `test/`
3. API/contracts in `src/shared/types/api.ts`
4. Runtime docs (`README.md`, `docs/progress.md`)
5. Vision/spec docs (roadmap intent, may be ahead of implementation)

## Architecture Pointers

- Server routes: `src/server/routes/*`
- Integrations: `src/integrations/*`
- Scanner/verify: `src/scanner/*`
- DB layer: `src/db/*`
- UI app: `src/ui/src/*`

## Guardrails

- Curatarr stores decision-critical metadata, not full media browsing metadata.
- Library roots must be real filesystem paths (non-symlink) for deterministic scan/safety behavior.
- Prefer portable Linux/Docker-safe paths and behavior.
