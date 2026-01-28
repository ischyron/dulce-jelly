# Curatarr — Agent Instructions

## Project Overview

**Curatarr** is an LLM-backed media library management system that replaces Radarr, Sonarr, Prowlarr, and Recyclarr with a single intelligent system.

**Status**: MVP in progress — CLI scaffold done, core modules pending.

## Key Documents

- [docs/VISION.md](docs/VISION.md) — Full design, architecture, and phased implementation plan
- [config/config.example.yaml](config/config.example.yaml) — Configuration reference
- [README.md](README.md) — Quick start and status

## Core Value Proposition

1. **LLM content verification** — Prevent wrong-content replacements (F1 movie → F1 race incident)
2. **Quality authenticity** — Catch fake "4K Remux" at 2GB via size-to-quality validation
3. **FFprobe analysis** — Actual bitrate metrics, not filename guessing
4. **Stack simplification** — Single system replaces 4+ *arr apps

## Architecture

```
src/
├── cli/           # CLI commands (scan, search, grab, cache, monitor)
├── monitor/       # Library + health monitoring (IMPLEMENTED)
│   ├── healthChecker.ts    # Service connectivity checks
│   ├── jellyfinClient.ts   # Jellyfin API with batched fetching
│   └── libraryMonitor.ts   # Missing file detection
├── scanner/       # FFprobe library analysis (PENDING)
├── search/        # Newznab indexer + SQLite cache (PENDING)
├── evaluator/     # LLM content/quality verification (PENDING)
├── quality/       # TRaSH profiles + group reputation (PENDING)
├── download/      # SABnzbd client (PENDING)
├── import/        # Post-download + Jellyfin rescan (PENDING)
└── shared/        # Config, types, utilities (DONE)
```

## Monitor Feature

### Dashboard Concept

Two-part dashboard:

**1. Library** - Issues with library integrity
- `error`: Missing files/folders (in Jellyfin but not on disk)
- `warning`: Multiple video files in folder, metadata mismatch
- `info`: Recently added, successful imports

**2. Health** - Service connectivity
- `info` (green): All services connected
- `warning`: Degraded (slow response, auth issues)
- `error`: Unreachable (timeout, connection refused)

### Services Monitored
- Jellyfin (library source)
- Indexer (Newznab API)
- SABnzbd (download client)
- TMDB (metadata)
- LLM provider (OpenAI/Anthropic)

### Jellyfin API Integration
- Batched fetching (configurable batch size)
- Error resilience (continues on batch failure)
- Fetches: Path, ProviderIds, MediaSources

## Implementation Priority

### Phase 1: Foundation (Current)
1. `scanner/ffprobe.ts` — Extract quality metrics from files
2. `search/indexerClient.ts` — Query Newznab API
3. `search/cache.ts` — SQLite caching
4. `search/titleParser.ts` — Parse release titles

### Phase 2: Quality Intelligence
1. `quality/profiles.ts` — Load TRaSH-based profiles
2. `quality/sizeValidation.ts` — Size-to-quality checks
3. `quality/groupReputation.ts` — Release group scoring

### Phase 3: LLM Verification
1. `evaluator/tmdbClient.ts` — Fetch movie metadata
2. `evaluator/contentVerifier.ts` — LLM content identity check
3. `evaluator/qualityChecker.ts` — LLM quality authenticity check

### Phase 4: Grab & Import
1. `download/sabnzbdClient.ts` — Send NZBs to SABnzbd
2. `import/folderNaming.ts` — TMDB-based folder naming
3. `import/jellyfinClient.ts` — Trigger library rescan

## Code Guidelines

### Platform Portability
- **No macOS-specific code** — Must work on Linux (Docker target)
- Use `node:` prefix for Node built-ins
- Use `path.join()` for paths, never hardcode separators
- FFprobe calls via child_process, not native bindings

### TypeScript Patterns
- ESM modules (`"type": "module"`)
- `.js` extension in imports (ESM requirement)
- Types in `shared/types.ts`
- Config in `shared/config.ts`

### Error Handling
- CLI commands catch errors and exit with code 1
- Return structured errors, not thrown exceptions in library code
- Log to console, not to files (container-friendly)

### Testing
- Use Node's built-in test runner (`node --test`)
- Test files in `test/` directory
- Mock external APIs (Newznab, SABnzbd, TMDB, OpenAI)

## Key Types

```typescript
// Library item with FFprobe metrics
interface LibraryItem {
  path: string;
  title: string;
  year: number;
  quality: FileQuality;
  qualityScore: number;
  upgradeRecommended: boolean;
}

// Parsed release from indexer
interface Release {
  guid: string;
  title: string;
  size: number;
  parsed: ParsedRelease;
  evaluation?: LLMEvaluation;
  recommendation: 'accept' | 'reject' | 'review';
}

// LLM evaluation result
interface LLMEvaluation {
  contentMatch: { confidence: number; reasoning: string };
  qualityAuthenticity: { confidence: number; reasoning: string };
  recommendation: 'accept' | 'reject' | 'review';
}
```

## CLI Commands

```bash
curatarr scan [path]              # Scan library with FFprobe
curatarr search "title year"      # Search + LLM verify
curatarr grab <guid> --confirm    # Send to SABnzbd
curatarr cache sync               # Fetch recent releases
curatarr cache stats              # Show cache info
curatarr monitor run              # Full monitor (library + health)
curatarr monitor health           # Service connectivity check
curatarr monitor library          # Library integrity check
```

## External APIs

| Service | Purpose | Auth |
|---------|---------|------|
| Newznab | Search releases | API key in URL |
| SABnzbd | Download NZBs | API key param |
| TMDB | Movie metadata | Bearer token |
| OpenAI | LLM verification | Bearer token |
| Jellyfin | Library rescan | API key header |

## Configuration

Config loaded from (in order):
1. `$CURATARR_CONFIG` env var
2. `config/config.yaml`
3. `curatarr.yaml` in cwd

Environment variable expansion: `${VAR_NAME}` syntax in YAML.

## Build & Run

```bash
npm install          # Install deps
npm run build        # Compile TS
npm run dev          # Watch mode
node dist/index.js   # Run CLI
```

## Next Steps for Implementation

If resuming this work, start with:

1. **FFprobe scanner** — `src/scanner/ffprobe.ts`
   - Spawn `ffprobe -v quiet -print_format json -show_format -show_streams`
   - Parse output, extract video/audio metrics
   - Handle errors (file not found, not a video)

2. **Newznab client** — `src/search/indexerClient.ts`
   - Implement `search(query)` using native `fetch`
   - Parse XML response (Newznab format)
   - Map to `Release` type

3. **Title parser** — `src/search/titleParser.ts`
   - Regex patterns for resolution, codec, group, source
   - Extract year from title
   - Identify streaming service (AMZN, NF, ATVP)
