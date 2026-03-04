# Curatarr

**LLM-backed intelligent media library management**

Curatarr replaces the traditional *arr stack (Radarr, Sonarr, Prowlarr, Recyclarr) with a single intelligent system that uses LLM verification to prevent wrong-content replacements and fake quality claims.

## Status

🚧 **Work in Progress** — CLI scaffold implemented, core modules pending.

See [docs/VISION.md](docs/VISION.md) for full design document.
See [docs/scout-approach.md](docs/scout-approach.md) for the current CF scoring + Scout rules + TRaSH sync approach.

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure
cp config/config.example.yaml config/config.yaml
# Edit config.yaml with your API keys

# Build
npm run build

# Run
./dist/index.js --help
# or
node dist/index.js --help
```

## Commands

```bash
curatarr scan [path]              # Scan library, analyze file quality
curatarr search "Movie 2024"      # Search indexer with LLM verification
curatarr grab <guid> --confirm    # Download release via SABnzbd
curatarr cache sync               # Sync recent releases to cache
curatarr cache stats              # Show cache statistics
curatarr cache clear --confirm    # Clear search cache

# Monitoring
curatarr monitor run              # Run full monitoring check
curatarr monitor health           # Check service connectivity
curatarr monitor library          # Check for missing files
```

## Why Curatarr?

### The Problem

1. **Wrong-content replacements** — Radarr replaced "F1" (2025 movie) with an F1 race broadcast
2. **Fake quality claims** — "4K Remux" at 2GB passes CF scoring because keywords match
3. **Stack complexity** — 4+ systems to configure and maintain

### The Solution

- **LLM content verification** — Verifies release is actually the right movie
- **Quality authenticity checks** — Size-to-quality validation
- **FFprobe library analysis** — Actual bitrate, not filename guessing
- **Single system** — Replaces Radarr + Sonarr + Prowlarr + Recyclarr

## Architecture

```
Curatarr
├── Scanner     — FFprobe library analysis
├── Search      — Newznab indexer + cache
├── Evaluator   — LLM content/quality verification
├── Quality     — TRaSH-based profiles + group reputation
├── Download    — SABnzbd integration
└── Import      — Post-download handling + Jellyfin rescan
```

## Configuration

See [config/config.example.yaml](config/config.example.yaml) for full options.

Required API keys:
- `INDEXER_API_KEY` — Your Newznab indexer
- `SABNZBD_API_KEY` — SABnzbd
- `TMDB_API_KEY` — TMDB (for metadata)
- `OPENAI_API_KEY` — OpenAI (for LLM verification)

## Development

```bash
npm run build    # Compile TypeScript
npm run lint     # Run ESLint
npm run dev      # Watch mode
npm run test     # Run tests
```

## Implementation Status

### Phase 0: Monitoring (Done)
- [x] Health checker (service connectivity)
- [x] Jellyfin client (batched API fetching)
- [x] Library monitor (missing file detection)
- [x] Monitor CLI commands

### Phase 1: Foundation (In Progress)
- [x] Project structure
- [x] CLI scaffold
- [x] Config loader
- [x] Types
- [ ] FFprobe scanner
- [ ] Newznab client
- [ ] SQLite cache

### Phase 2: Quality Intelligence
- [ ] TRaSH profile loader
- [ ] Size validation
- [ ] Group reputation scoring

### Phase 3: LLM Verification
- [ ] TMDB client
- [ ] Content verification prompts
- [ ] Quality authenticity checks

### Phase 4: Grab & Import
- [ ] SABnzbd client
- [ ] Import handler
- [ ] Jellyfin integration

## License

See repository root.
