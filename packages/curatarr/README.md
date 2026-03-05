# Curatarr

Curatarr is a movie management tool for self-hosters who want better release scouting and automated quality upgrades without juggling multiple scoring systems. It depends on **Jellyfin** for library metadata and **Prowlarr** for indexer management. Curatarr can send download triggers to **SABnzbd** (NZB) and **qBittorrent**, and replaces release selection scoring logic that is typically split across Radarr/Recyclarr workflows.

Curatarr currently supports only movies. Support for series will be added in the future.

## Who Curatarr is for

Curatarr is for operators who want one ruleset for movie curation and optional LLM tie-breaking when deterministic scores are too close to automate confidently.

It is not intended as a full metadata browser. Curatarr stores only curation-critical metadata (scores, IDs, quality facts). Full rich metadata remains in Jellyfin.

## How Curatarr differs from Radarr/Recyclarr workflows

- Curatarr combines deterministic scoring (TRaSH + user CF rules + metadata signals) with optional LLM review when candidates tie.
- Curatarr avoids repeated score duplication across separate tools and profiles.
- Curatarr evaluates actual media quality with ffprobe and bitrate gates instead of filename-only assumptions.
- Curatarr keeps user control for high-impact actions and exposes auditability in UI/API flows.

## Important library path rule

Library roots must be real filesystem paths, not symlinks.

Why this is enforced:
- Symlinked roots can escape Docker mount boundaries and point Curatarr to paths the container cannot safely access.
- NAS symlink targets can resolve differently across host/container paths, causing false missing-file reports and risky delete decisions.
- Real paths make scan, sync, and delete behavior deterministic and auditable across environments.

If you run in Docker or on NAS, mount the actual target folder and configure that exact mounted path in Settings.

## ⚖️ Legal Notice

> Curatarr provides curation workflows, scoring logic, and automation guidance for
> self-hosted media libraries, including media you own or have rights to use.
> It does not include media content, content sources, or preconfigured acquisition
> mechanisms, and it does not endorse or facilitate infringement.
> Users are responsible for ensuring their use of Curatarr and third-party software
> complies with applicable laws.

## Docs

- Vision: [docs/VISION.md](docs/VISION.md)
- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Progress tracker: [docs/progress.md](docs/progress.md)
- Scout scoring details: [docs/scout-approach.md](docs/scout-approach.md)
- Scout rules and LLM filtering: [docs/scout-rules.md](docs/scout-rules.md)
- Technical architecture: [docs/technical/architecture.md](docs/technical/architecture.md)
- OpenAPI reference: [docs/api/](docs/api/)

## Quick Start

```bash
npm install
cp config/config.example.yaml config/config.yaml
npm run build
npm run serve
```

Open `http://localhost:7474` unless you changed the port.

## Main commands

```bash
curatarr serve
curatarr scan <path>
curatarr jf-sync
curatarr report [path]
```

## Development

```bash
npm run dev
npm run dev:server
npm run dev:ui
npm run test
npm run test:e2e
```
