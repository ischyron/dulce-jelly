# Curatarr Progress

> Last updated: 2026-03-05
> Scope: implementation status in this repository (not planned-only items from vision/spec)

## Current Snapshot

Curatarr is beyond scaffold stage. The codebase has a working server, a functional multi-page UI, SQLite persistence, and live integrations for Jellyfin and Prowlarr. Core user flows already implemented are library scan/sync, disambiguation, verify, scout queue, and settings management.

## What Exists Today

### Runtime + Platform

- Node 20+ TypeScript app with CLI entrypoint (`src/index.ts`)
- Hono HTTP server with API routes (`src/server/routes/*`)
- React + Vite frontend (`src/ui`)
- SQLite database layer (`src/db`)
- Shared cross-layer contracts/utilities (`src/shared`, `src/shared/types`)

### Implemented Integrations

- Jellyfin integration client + sync pipeline:
  - `src/integrations/jellyfin/client.ts`
  - `src/integrations/jellyfin/sync.ts`
- Prowlarr integration client:
  - `src/integrations/prowlarr/client.ts`

### Server/API Feature Areas

- Scan: trigger, status, history, SSE progress
- Sync: Jellyfin sync orchestration and status
- Movies/library listing and filtering APIs
- Disambiguation queue/actions
- Verify workflow + failure listing/events
- Scout workflow (single/batch search, auto-run scheduling, TRaSH sync/parity endpoints)
- Candidates, rules, settings, stats, and utility proxy/filesystem endpoints

### Frontend Feature Areas

- Dashboard
- Library
- Movie detail
- Scan
- Scout Queue
- Verify
- Disambiguate
- Settings

Pages live in `src/ui/src/pages`, with extracted feature components under `src/ui/src/components`.

### CLI Surface (Current)

- `curatarr serve`
- `curatarr scan`
- `curatarr jf-sync`
- `curatarr report`

## What Is Partially Implemented / Evolving

- Scout scoring/rules UX and parity tooling are implemented and active, but still undergoing refinement.
- Settings and architecture docs are catching up with ongoing refactors.
- Frontend decomposition is in progress (large pages being split into feature components).

## What Is Not Finished Yet

- Full roadmap scope in `docs/SPEC.md` is not complete end-to-end.
- Some planned modules in vision/spec remain design-level or partial.
- Legacy/generated artifacts still exist in parts of the repo and are being cleaned during refactors.

## Related Docs

- Product spec: [SPEC.md](./SPEC.md)
- Vision: [VISION.md](./VISION.md)
- Architecture: [technical/architecture.md](./technical/architecture.md)
