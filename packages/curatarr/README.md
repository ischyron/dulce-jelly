# Curatarr

LLM-assisted media curation for Jellyfin libraries.

Curatarr is a Node/TypeScript app with a Hono API + React UI that focuses on library scanning, metadata sync, disambiguation, verification, and scout workflows. It keeps Prowlarr as the indexer integration layer.

## Docs

- Vision: [docs/VISION.md](docs/VISION.md)
- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Project progress (source of truth): [docs/progress.md](docs/progress.md)
- Architecture overview: [docs/technical/architecture.md](docs/technical/architecture.md)
- Frontend structure: [docs/technical/frontend.md](docs/technical/frontend.md)
- Repo structure: [docs/technical/repo.md](docs/technical/repo.md)
- Scout scoring details: [docs/scout-approach.md](docs/scout-approach.md)
- Scoring YAML reference: [docs/scoring-yaml.md](docs/scoring-yaml.md)
- OpenAPI reference source: [docs/api/](docs/api/)
- GitHub page source: [docs/site/](docs/site/)

## Quick Start

```bash
npm install
cp config/config.example.yaml config/config.yaml
npm run build
npm run serve
```

Open the server URL printed by `serve` (default `http://localhost:7474`).

## CLI Commands

```bash
curatarr serve                      # Start API + UI server
curatarr scan <path>                # Scan library files with ffprobe
curatarr jf-sync                    # Sync Jellyfin library metadata to DB
curatarr report [path]              # Print quality/report output
```

## Development

```bash
npm run dev         # tsc watch + API + UI
npm run dev:server  # tsc watch + API
npm run dev:ui      # UI only
npm run docs:api:build
npm run test
npm run test:e2e
```
