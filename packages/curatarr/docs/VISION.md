# Curatarr — Intelligent Media Library Management

> **Status**: Vision Document (Draft)
> **Branch**: `feat/nzb-search-module`
> **Working name**: Curatarr (open to alternatives)

## Executive Summary

**Curatarr** is an LLM-backed media acquisition and library management system that replaces the traditional *arr stack (Radarr, Sonarr, Prowlarr, Recyclarr) with a single intelligent system.

**Core insight**: The *arr stack is complex, and its decision-making is rule-based. An LLM-backed system can make smarter decisions about content identity, quality authenticity, and upgrade worthiness — preventing incidents like wrong-content replacements while simplifying the stack.

---

## The Problem

### Current Stack Complexity

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Prowlarr │  │  Radarr  │  │  Sonarr  │  │Recyclarr │
│ (indexer)│  │ (movies) │  │   (TV)   │  │ (rules)  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │             │
     └─────────────┴─────────────┴─────────────┘
                        │
              4 systems to configure
              4 systems to maintain
              4 systems making decisions
```

### Real-World Failures

**UC-1: The F1 Incident**
> Radarr auto-upgraded "F1" (2025 Brad Pitt movie) and replaced it with an F1 Abu Dhabi Grand Prix race broadcast. Completely wrong content.

**Root cause**: Radarr's title matching is string-based. "F1" matches both the movie and any Formula 1 race recording. No semantic understanding.

**UC-2: Fake Quality Claims**
> A "4K HDR Remux" from an unknown group at 2GB — obviously fake, but passed CF scoring because it had the right keywords.

**Root cause**: Custom Format scoring is additive. A release claiming all the right keywords scores high even if physically impossible.

**UC-3: Suboptimal Upgrades**
> Upgraded from AMZN WEB-DL to an unknown WEB with slightly higher CF score. Actual quality was worse (encode-of-encode).

**Root cause**: Score-only decisions don't consider source lineage or encode quality.

---

## What Radarr Actually Does (Corrected)

Research into Radarr's source code revealed:

| Capability | How It Works |
|------------|--------------|
| **File analysis** | Uses FFprobe via FFMpegCore (not just filename parsing) |
| **Resolution detection** | Reads actual video dimensions from file |
| **Codec/HDR detection** | Extracts from file streams |
| **Quality augmentation** | 5 augmenters: filename, folder, download client, MediaInfo (highest confidence), release name |

**What Radarr does NOT do:**
- Bitrate-based quality decisions (feature request marked "Won't Fix")
- LLM-backed content verification
- Semantic understanding of release content
- Size-to-quality sanity checks beyond filename parsing

**Key insight**: Radarr is technically capable but makes naive decisions. The decision logic is the problem, not the file analysis.

---

## The Solution: Curatarr

### Value Proposition

| Traditional *arr | Curatarr |
|------------------|----------|
| 4+ systems | 1 system |
| Rule-based decisions | LLM-backed intelligence |
| Filename-based content matching | Semantic content verification |
| Additive CF scoring | Size-to-quality sanity checks |
| Separate indexer manager | Direct indexer integration |
| Complex configuration | Quality profiles baked in |

### Core Differentiators

1. **LLM Content Verification**
   - Prevents wrong-content replacements (F1 incident)
   - Understands movie vs documentary vs sports broadcast
   - Catches sequel/remake confusion

2. **Quality Authenticity Checks**
   - Size-to-quality ratio validation
   - Release group reputation awareness
   - Fake quality claim detection

3. **Actual File Quality Metrics**
   - FFprobe analysis of existing library
   - Bitrate-aware upgrade decisions
   - Beyond resolution: evaluate actual encode quality

4. **Simplified Architecture**
   - Single system replaces Radarr + Sonarr + Prowlarr + Recyclarr
   - Jellyfin remains the library manager and player
   - SABnzbd/qBittorrent remain download clients

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             REFINERY                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        LLM EVALUATOR                             │    │
│  │  • Content identity verification                                 │    │
│  │  • Quality authenticity assessment                               │    │
│  │  • Upgrade worthiness analysis                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│         │              │               │               │                 │
│         ▼              ▼               ▼               ▼                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │  Library  │  │  Search   │  │  Download │  │  Import   │            │
│  │  Scanner  │  │  Engine   │  │  Manager  │  │  Handler  │            │
│  │ (ffprobe) │  │ (indexer) │  │ (SABnzbd) │  │ (rename)  │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      QUALITY ENGINE                              │    │
│  │  • TRaSH rules (baked in)         • Release group reputation    │    │
│  │  • Profile definitions            • Size/bitrate validation     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         WEB UI                                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │ Library  │ │ Quality  │ │ Activity │ │ Settings │           │    │
│  │  │ Overview │ │ Analysis │ │   Feed   │ │          │           │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐         ┌──────────┐
   │ Jellyfin │        │ SABnzbd  │         │ Indexer  │
   │ (library │        │ (downld) │         │ (direct) │
   │ + player)│        └──────────┘         └──────────┘
   └──────────┘
```

---

## Core Workflows

### 1. Library Quality Audit

Scan existing library and evaluate actual file quality.

```
Scan /media/movies/
    ↓
For each movie folder:
  ├─ ffprobe → extract actual metrics
  │   • Video: bitrate, codec, resolution, HDR type
  │   • Audio: codec, channels, bitrate
  │   • Container: format, duration
  │
  ├─ Compare to quality profile targets
  │   • Is this 1080p actually good? (check bitrate)
  │   • Is HDR metadata correct?
  │   • Does file size match quality claim?
  │
  └─ Flag for upgrade if below threshold
      • "This 1080p is 2.1 Mbps avg, should be 8+ Mbps"
      • "Claimed x265 but actually x264"
```

**CLI:**
```bash
curatarr scan /media/movies --profile Efficient-4K
curatarr scan --report  # generate quality report
```

### 2. Intelligent Search & Verification

Search indexer with LLM-backed verification.

```
User: curatarr search "F1 2025" --profile Efficient-4K
    ↓
Query indexer (Newznab API)
    ↓
For each result:
  ├─ Parse release title → resolution, codec, group, source
  │
  ├─ Apply quality rules
  │   • Size limits (TRaSH definitions)
  │   • Release group reputation
  │   • Size-to-quality sanity check
  │
  ├─ LLM verification
  │   • Fetch TMDB metadata for "F1 2025"
  │   • Compare release to movie metadata
  │   • Is this the Brad Pitt movie or a race broadcast?
  │   • Confidence score + reasoning
  │
  └─ Return ranked results with verification status

Results:
  ✓ F1.2025.2160p.AMZN.WEB-DL... (content: 98%, quality: 95%)
  ✓ F1.2025.1080p.MA.WEB-DL...  (content: 96%, quality: 88%)
  ✗ F1.2024.Abu.Dhabi.GP...     (rejected: sports broadcast)
  ✗ Formula.1.Drive.to.Survive  (rejected: TV series)
```

### 3. User-Confirmed Grab

Download with explicit user confirmation (legally compliant).

```
User reviews search results
    ↓
User: curatarr grab <guid> --confirm
    ↓
Send NZB to SABnzbd
    ↓
Log action (audit trail)
    ↓
Return job ID
```

### 4. Post-Download Import

Handle completed downloads.

```
SABnzbd completes download
    ↓
Webhook → Curatarr import handler
    ↓
  ├─ Parse release name → identify movie
  ├─ Fetch TMDB metadata
  ├─ Create folder: "Movie Name (Year) {imdb-tt123}/"
  ├─ Move file to folder
  ├─ FFprobe → verify quality matches expectations
  └─ Trigger Jellyfin library rescan
    ↓
Log import with quality metrics
```

### 5. Upgrade Polling (Background)

Periodically check library for upgrade opportunities.

```
Scheduled: curatarr poll --batch 10
    ↓
For each movie in library:
  ├─ Current quality metrics (from ffprobe)
  ├─ Target quality (from profile)
  │
  ├─ If below target:
  │   ├─ Search indexer for candidates
  │   ├─ LLM verification on each
  │   ├─ Compare candidate vs current
  │   │   • Same source? Better encode?
  │   │   • Worth the size increase?
  │   └─ Queue for user review (or auto-approve if high confidence)
  │
  └─ Log decision
```

---

## Components

### Library Scanner (`scanner/`)

```typescript
interface LibraryItem {
  path: string;
  tmdbId: number;
  imdbId: string;
  title: string;
  year: number;

  // FFprobe metrics
  quality: {
    resolution: '720p' | '1080p' | '2160p';
    videoBitrate: number;      // kbps
    videoCodec: string;        // x264, x265, AV1
    hdrType: string | null;    // HDR10, DV, HLG
    audioBitrate: number;
    audioCodec: string;
    audioChannels: string;     // 5.1, 7.1
    fileSize: number;          // bytes
    duration: number;          // seconds
  };

  // Calculated
  bitratePerMinute: number;    // for size validation
  qualityScore: number;        // 0-100
  upgradeRecommended: boolean;
}
```

### Search Engine (`search/`)

- Direct Newznab API integration (no Prowlarr)
- SQLite cache for search results
- Title parsing with TRaSH patterns
- Release group reputation scoring

### LLM Evaluator (`evaluator/`)

```typescript
interface LLMEvaluation {
  contentMatch: {
    confidence: number;        // 0-100
    reasoning: string;
    flags: string[];           // ['sequel_confusion', 'different_content_type']
  };

  qualityAuthenticity: {
    confidence: number;
    reasoning: string;
    flags: string[];           // ['size_mismatch', 'unknown_group']
  };

  recommendation: 'accept' | 'reject' | 'review';
}
```

**LLM Prompt Strategy:**

```
You are evaluating a Usenet release for a media library.

MOVIE (from TMDB):
- Title: {title}
- Year: {year}
- Plot: {plot}
- Genre: {genres}
- Runtime: {runtime} min
- Cast: {cast}

RELEASE:
- Title: "{release_title}"
- Size: {size}
- Parsed: {resolution}, {source}, {codec}
- Group: {group} (reputation: {tier})

CURRENT FILE (if upgrade):
- Quality: {current_resolution} @ {current_bitrate} kbps
- Source: {current_source}

EVALUATE:
1. Content match: Is this release the correct movie?
2. Quality authenticity: Does size match claimed quality?
3. Upgrade value: (if applicable) Is this better than current?

Return JSON with confidence scores and reasoning.
```

### Quality Engine (`quality/`)

- TRaSH quality definitions (baked in, not external Recyclarr)
- Profile definitions: HD, Efficient-4K, HighQuality-4K
- Size-to-quality validation tables
- Release group reputation tiers

### Download Manager (`download/`)

- SABnzbd API integration
- qBittorrent API integration (for torrents)
- Grab logging and audit trail
- Webhook handler for completion

### Import Handler (`import/`)

- TMDB metadata fetcher
- Folder naming: `{Title} ({Year}) {imdb-{ImdbId}}`
- File move/copy with verification
- Jellyfin API: trigger library rescan

### Web UI (`web/`)

| View | Purpose |
|------|---------|
| **Library** | Browse library with quality metrics overlay |
| **Quality Analysis** | See upgrade candidates, quality distribution |
| **Activity Feed** | All actions logged with reasoning |
| **Search** | Search interface with verification display |
| **Settings** | Profiles, indexer config, LLM settings |

---

## Stack Comparison

### Before (Traditional)

| Service | Purpose | Status |
|---------|---------|--------|
| Jellyfin | Library + Player | Keep |
| Jellyseerr | Requests | Keep (optional) |
| Radarr | Movie management | **Replace** |
| Sonarr | TV management | **Replace** |
| Prowlarr | Indexer management | **Replace** |
| Recyclarr | Quality rules sync | **Replace** |
| SABnzbd | Usenet downloads | Keep |
| qBittorrent | Torrent downloads | Keep |
| Caddy | Reverse proxy | Keep |

### After (Curatarr)

| Service | Purpose |
|---------|---------|
| Jellyfin | Library + Player |
| Curatarr | Everything else |
| SABnzbd | Usenet downloads |
| qBittorrent | Torrent downloads |
| Caddy | Reverse proxy |

**Container count**: 9 → 5

---

## Jellyfin Integration

### Option A: Jellyfin Plugin

Build a Jellyfin plugin that:
- Adds "Quality" badge to library items
- Shows upgrade availability
- "Send to Curatarr" button for acquisitions
- Replaces Jellyseerr for requests

### Option B: API Integration

Curatarr polls Jellyfin library:
- Uses Jellyfin as source of truth for "what I have"
- Triggers Jellyfin rescan after imports
- Jellyseerr continues to work (optional)

**Recommendation**: Start with Option B (simpler), add plugin later.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync strategy | On-demand | User runs `curatarr sync`; no scheduled sync |
| Indexer | Single for MVP | Direct Newznab API; multi-indexer later |
| REST API | Not MVP | CLI-first; API later for UI |
| Download trigger | User-confirmed | `--confirm` flag required; legally compliant |
| Content scope | Movies first | TV is more complex; post-MVP |
| Prowlarr | Eliminate | Query indexer directly |
| Radarr/Sonarr | Eliminate | Curatarr handles search + import |
| Recyclarr | Eliminate | Rules baked into Curatarr |

---

## Implementation Phases

### Phase 1: Core CLI (MVP)
- [ ] Library scanner with FFprobe metrics
- [ ] Indexer client (Newznab direct)
- [ ] Title parser (TRaSH patterns)
- [ ] SQLite cache
- [ ] CLI: `scan`, `search`, `cache-stats`

### Phase 2: Quality Intelligence (MVP)
- [ ] Quality profile definitions
- [ ] Size-to-quality validation
- [ ] Release group reputation tiers
- [ ] TRaSH CF scoring (simplified)

### Phase 3: LLM Verification (MVP)
- [ ] TMDB client
- [ ] Content verification prompts
- [ ] Quality authenticity checks
- [ ] Confidence scoring

### Phase 4: Grab & Import (MVP)
- [ ] SABnzbd client
- [ ] CLI: `grab <guid> --confirm`
- [ ] Import handler (webhook)
- [ ] Folder naming + move
- [ ] Jellyfin rescan trigger

### Phase 5: Upgrade Polling
- [ ] Background poll workflow
- [ ] Current vs candidate comparison
- [ ] Auto-approve thresholds
- [ ] Notification system

### Phase 6: Web UI
- [ ] Activity feed
- [ ] Library view with quality overlay
- [ ] Search interface
- [ ] Settings management

### Phase 7: TV Support
- [ ] Series/season/episode parsing
- [ ] TVDB integration
- [ ] Season pack handling

### Phase 8: Jellyfin Plugin
- [ ] Quality badges
- [ ] Request integration
- [ ] Upgrade notifications

---

## Project Structure

```
curatarr/                      # or packages/curatarr/ if staying in monorepo
├── src/
│   ├── cli/                   # CLI entry points
│   │   ├── index.ts
│   │   ├── scan.ts
│   │   ├── search.ts
│   │   ├── grab.ts
│   │   └── poll.ts
│   │
│   ├── scanner/               # Library scanner
│   │   ├── index.ts
│   │   ├── ffprobe.ts
│   │   └── types.ts
│   │
│   ├── search/                # Indexer + cache
│   │   ├── index.ts
│   │   ├── indexerClient.ts   # Newznab API
│   │   ├── cache.ts           # SQLite
│   │   ├── titleParser.ts
│   │   └── types.ts
│   │
│   ├── evaluator/             # LLM evaluation
│   │   ├── index.ts
│   │   ├── contentVerifier.ts
│   │   ├── qualityChecker.ts
│   │   ├── prompts.ts
│   │   └── types.ts
│   │
│   ├── quality/               # Quality rules
│   │   ├── index.ts
│   │   ├── profiles.ts
│   │   ├── sizeValidation.ts
│   │   ├── groupReputation.ts
│   │   └── types.ts
│   │
│   ├── download/              # Download clients
│   │   ├── index.ts
│   │   ├── sabnzbdClient.ts
│   │   ├── qbittorrentClient.ts
│   │   └── types.ts
│   │
│   ├── import/                # Post-download
│   │   ├── index.ts
│   │   ├── tmdbClient.ts
│   │   ├── folderNaming.ts
│   │   ├── jellyfinClient.ts
│   │   └── types.ts
│   │
│   ├── web/                   # Web UI (Phase 6)
│   │   └── ...
│   │
│   └── shared/                # Shared utilities
│       ├── config.ts
│       ├── logger.ts
│       └── db.ts
│
├── test/
├── docs/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── package.json
```

---

## Naming Options

| Name | Rationale |
|------|-----------|
| **Curatarr** | Raw downloads → refined library; clear metaphor |
| **Curate** | Curated media collection |
| **Criterion** | Reference to quality standard |
| **Arbiter** | Makes quality judgments |
| **Qualitarr** | Stays in *arr family, familiar to community |

**Current working name**: Curatarr

---

## Open Questions

1. **Standalone repo or monorepo?**
   - Standalone: cleaner for open source
   - Monorepo: easier for DulceJelly integration

2. **Tech stack for UI?**
   - Svelte (lightweight)
   - React (more familiar)
   - htmx (minimal JS)

3. **Jellyseerr replacement?**
   - Build request management into Curatarr
   - Or keep Jellyseerr, integrate via API

4. **Torrent support in MVP?**
   - Currently focused on Usenet
   - qBittorrent integration can share patterns

---

## Success Metrics

1. **F1 incident prevention**: Zero wrong-content replacements
2. **Quality accuracy**: Actual bitrate matches expected for quality tier
3. **Stack simplification**: 4 containers eliminated
4. **User confidence**: High-confidence recommendations need no manual review
