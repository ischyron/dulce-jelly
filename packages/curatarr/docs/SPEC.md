# Curatarr Specification

> **Version**: 0.1.0-draft
> **Status**: Requirements gathering
> **Last Updated**: 2025-01-28

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Core Features](#3-core-features)
4. [System Architecture](#4-system-architecture)
5. [Feature Specifications](#5-feature-specifications)
6. [Configuration](#6-configuration)
7. [User Interface](#7-user-interface)
8. [API Reference](#8-api-reference)
9. [Implementation Phases](#9-implementation-phases)
10. [Appendix](#appendix)

---

## 1. Executive Summary

**Curatarr** is an LLM-backed intelligent media library management system that replaces the traditional *arr stack (Radarr, Sonarr, Prowlarr, Recyclarr) with a single, smarter system.

### Key Differentiators

| Traditional *arr | Curatarr |
|------------------|----------|
| 4+ systems to configure | Single system |
| Rule-based decisions | LLM-backed intelligence |
| Filename-based matching | Semantic content verification |
| Additive CF scoring | Size-to-quality validation |
| Complex configuration | Quality profiles baked in |

### Stack Simplification

**Before**: Jellyfin + Radarr + Sonarr + Prowlarr + Recyclarr + SABnzbd
**After**: Jellyfin + Curatarr + SABnzbd

---

## 2. Problem Statement

### 2.1 The F1 Incident

Radarr auto-upgraded "F1" (2025 Brad Pitt movie) and replaced it with an F1 Abu Dhabi Grand Prix race broadcast.

**Root cause**: Naive string matching. No semantic understanding of content.

### 2.2 Fake Quality Claims

A "4K HDR Remux" from unknown group at 2GB passed CF scoring because keywords matched.

**Root cause**: Additive scoring without size-to-quality validation.

### 2.3 Stack Complexity

Managing 4+ systems with interconnected configurations is error-prone and time-consuming.

---

## 3. Core Features

### 3.1 Feature Matrix

| Feature | Priority | Status | Phase |
|---------|----------|--------|-------|
| Health monitoring | P0 | ✅ Done | 0 |
| Library monitoring | P0 | ✅ Done | 0 |
| FFprobe library scanning | P0 | 🔲 Pending | 1 |
| Newznab indexer search | P0 | 🔲 Pending | 1 |
| LLM content verification | P0 | 🔲 Pending | 2 |
| Quality profile matching | P0 | 🔲 Pending | 2 |
| SABnzbd integration | P0 | 🔲 Pending | 3 |
| Post-download import | P1 | 🔲 Pending | 3 |
| Upgrade polling | P1 | 🔲 Pending | 4 |
| Rate limiting | P1 | 🔲 Pending | 4 |
| Recycle bin | P1 | 🔲 Pending | 4 |
| Web UI | P2 | 🔲 Pending | 5 |
| TV show support | P2 | 🔲 Pending | 6 |
| Jellyfin plugin | P3 | 🔲 Pending | 7 |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CURATARR                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        LLM EVALUATOR                             │    │
│  │  • Content identity verification (prevents F1 incident)         │    │
│  │  • Quality authenticity assessment                               │    │
│  │  • Upgrade worthiness analysis                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│  ┌──────────┬──────────┬──────────┼──────────┬──────────┬──────────┐   │
│  │ Monitor  │ Scanner  │ Search   │ Quality  │ Download │ Import   │   │
│  │ ✅ Done  │ Pending  │ Pending  │ Pending  │ Pending  │ Pending  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      RATE LIMITER                                │    │
│  │  • Max movies/day    • Max episodes/day    • Cooldown periods   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      RECYCLE BIN                                 │    │
│  │  • Soft delete → recycle folder    • Configurable retention    │    │
│  │  • Hard delete requires explicit opt-in (dangerous)             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐         ┌──────────┐
   │ Jellyfin │        │ SABnzbd  │         │ Indexer  │
   └──────────┘        └──────────┘         └──────────┘
```

### 4.2 Module Structure

```
src/
├── cli/                    # CLI commands
│   ├── scan.ts
│   ├── search.ts
│   ├── grab.ts
│   ├── cache.ts
│   └── monitor.ts
│
├── monitor/                # ✅ IMPLEMENTED
│   ├── healthChecker.ts    # Service connectivity
│   ├── jellyfinClient.ts   # Jellyfin API
│   └── libraryMonitor.ts   # Missing file detection
│
├── scanner/                # 🔲 PENDING
│   ├── ffprobe.ts          # FFprobe wrapper
│   ├── fileScanner.ts      # Directory traversal
│   └── qualityAnalyzer.ts  # Quality scoring
│
├── search/                 # 🔲 PENDING
│   ├── indexerClient.ts    # Newznab API
│   ├── cache.ts            # SQLite cache
│   └── titleParser.ts      # Release title parsing
│
├── evaluator/              # 🔲 PENDING
│   ├── llmClient.ts        # OpenAI/Anthropic
│   ├── contentVerifier.ts  # Content identity
│   ├── qualityChecker.ts   # Quality authenticity
│   └── prompts.ts          # LLM prompts
│
├── quality/                # 🔲 PENDING
│   ├── profiles.ts         # Quality profiles
│   ├── sizeValidation.ts   # Size-to-quality
│   └── groupReputation.ts  # Release groups
│
├── download/               # 🔲 PENDING
│   ├── sabnzbdClient.ts    # SABnzbd API
│   └── grabHandler.ts      # Download orchestration
│
├── import/                 # 🔲 PENDING
│   ├── folderNaming.ts     # TMDB-based naming
│   ├── fileHandler.ts      # Move/copy/link
│   └── jellyfinSync.ts     # Library rescan
│
├── upgrade/                # 🔲 PENDING
│   ├── rateLimiter.ts      # Daily limits
│   ├── upgradePoller.ts    # Background polling
│   └── candidateRanker.ts  # Upgrade candidates
│
├── recycle/                # 🔲 PENDING
│   ├── recycleBin.ts       # Soft delete
│   └── retentionPolicy.ts  # Auto-cleanup
│
└── shared/                 # ✅ IMPLEMENTED
    ├── config.ts
    └── types.ts
```

---

## 5. Feature Specifications

### 5.1 Rate Limiting

#### 5.1.1 Purpose

Prevent runaway upgrades that consume bandwidth, storage, and API quotas.

#### 5.1.2 Configuration

```yaml
rateLimits:
  movies:
    maxPerDay: 10           # Max movie upgrades per 24h
    maxPerHour: 3           # Max movie upgrades per hour
    cooldownMinutes: 30     # Min time between upgrades

  episodes:
    maxPerDay: 50           # Max episode upgrades per 24h
    maxPerHour: 10          # Max episode upgrades per hour
    cooldownMinutes: 5      # Min time between upgrades

  global:
    maxConcurrent: 2        # Max concurrent downloads
    pauseOnDiskSpaceMB: 50000  # Pause if <50GB free
```

#### 5.1.3 Behavior

1. **Daily Reset**: Counters reset at midnight (configurable timezone)
2. **Persistence**: Counters survive restarts (stored in SQLite)
3. **Priority Queue**: High-priority items can exceed soft limits
4. **Manual Override**: CLI flag `--ignore-limits` for one-off runs

#### 5.1.4 CLI

```bash
curatarr limits status              # Show current usage
curatarr limits reset               # Reset counters (admin)
curatarr upgrade --ignore-limits    # One-off override
```

---

### 5.2 Recycle Bin

#### 5.2.1 Purpose

Prevent accidental data loss by soft-deleting files to a recycle folder instead of permanent deletion.

#### 5.2.2 Configuration

```yaml
recycleBin:
  enabled: true
  path: /media/.curatarr-recycle    # Recycle folder location
  retentionDays: 30                  # Auto-delete after 30 days
  maxSizeGB: 500                     # Max recycle bin size

  # Dangerous: Enable permanent delete
  # WARNING: Files cannot be recovered after permanent delete
  allowPermanentDelete: false
```

#### 5.2.3 Behavior

**Soft Delete (Default)**:
1. File moved to `recycleBin.path/{original-path-hash}/`
2. Metadata stored in SQLite (original path, delete time, reason)
3. File can be restored via CLI or UI
4. Auto-purged after `retentionDays`

**Permanent Delete (Dangerous)**:
1. Requires `allowPermanentDelete: true` in config
2. UI shows prominent warning
3. Requires confirmation dialog with typed confirmation
4. Logged with timestamp and user context

#### 5.2.4 Folder Structure

```
/media/.curatarr-recycle/
├── .metadata.sqlite           # Recycle bin metadata
├── a1b2c3d4/                  # Hash of original path
│   ├── .curatarr-meta.json   # Original path, delete time
│   └── Movie.File.mkv        # Actual file
└── e5f6g7h8/
    └── ...
```

#### 5.2.5 CLI

```bash
curatarr recycle list              # List recycled items
curatarr recycle restore <id>      # Restore to original location
curatarr recycle purge             # Force purge expired items
curatarr recycle delete <id>       # Permanent delete (if enabled)
curatarr recycle stats             # Size, count, oldest item
```

#### 5.2.6 UI Warning for Permanent Delete

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  DANGER: Permanent Delete                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You are about to PERMANENTLY DELETE the following file:       │
│                                                                 │
│  📁 /media/movies/Example Movie (2024)/Example.Movie.mkv       │
│  📊 Size: 15.4 GB                                               │
│                                                                 │
│  ⚠️  This action CANNOT be undone.                              │
│  ⚠️  The file will be permanently removed from disk.            │
│                                                                 │
│  To confirm, type "DELETE" below:                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Cancel]                              [Permanently Delete]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.3 Library Monitoring

#### 5.3.1 Status: ✅ IMPLEMENTED

#### 5.3.2 Features

| Feature | Status | Description |
|---------|--------|-------------|
| Missing file detection | ✅ | Files in Jellyfin but not on disk |
| Duplicate video detection | ✅ | >1 video file per movie folder |
| Batched API calls | ✅ | Configurable batch size |
| Error resilience | ✅ | Continues on batch failure |
| Severity levels | ✅ | info/warning/error |

#### 5.3.3 Issue Types

| Type | Severity | Description |
|------|----------|-------------|
| `missing_file` | error | File referenced in Jellyfin not found |
| `missing_folder` | error | Folder referenced in Jellyfin not found |
| `multiple_video_files` | warning | >1 video file in movie folder |
| `empty_folder` | warning | Folder exists but no video files |
| `orphan_file` | info | File on disk not in Jellyfin |
| `metadata_mismatch` | info | Title/year mismatch |

---

### 5.4 Health Monitoring

#### 5.4.1 Status: ✅ IMPLEMENTED

#### 5.4.2 Services Monitored

| Service | Endpoint | Timeout | Retries |
|---------|----------|---------|---------|
| Jellyfin | `/System/Info` | 5s | 2 |
| Indexer | `/api?t=caps` | 5s | 2 |
| SABnzbd | `/api?mode=version` | 5s | 2 |
| TMDB | `/3/configuration` | 5s | 2 |
| LLM | Provider-specific | 5s | 2 |

#### 5.4.3 Status Levels

| Status | Color | Meaning |
|--------|-------|---------|
| `healthy` | 🟢 Green | Service responding normally |
| `degraded` | 🟡 Yellow | Slow response or auth issues |
| `unreachable` | 🔴 Red | Connection failed after retries |

---

### 5.5 LLM Content Verification

#### 5.5.1 Status: 🔲 PENDING

#### 5.5.2 Purpose

Prevent wrong-content replacements by verifying release identity against TMDB metadata.

#### 5.5.3 Verification Flow

```
1. Fetch movie metadata from TMDB
   - Title, year, plot, genres, runtime, cast

2. Parse release title
   - Extracted title, year, resolution, source, group

3. LLM evaluation
   - Is this the same movie?
   - Could it be a sequel/remake/sports event?
   - Confidence score 0-100

4. Decision
   - accept: High confidence match
   - reject: Definite mismatch
   - review: Ambiguous, needs human review
```

#### 5.5.4 Prompt Template

```
You are evaluating a Usenet release for a media library.

MOVIE (from TMDB):
- Title: {title}
- Year: {year}
- Plot: {plot}
- Genres: {genres}
- Runtime: {runtime} min
- Cast: {cast}

RELEASE:
- Title: "{release_title}"
- Size: {size}
- Parsed: {resolution}, {source}, {codec}
- Group: {group}

EVALUATE:
1. Content match: Is this the correct movie? (0-100 confidence)
2. Flags: Any concerns? (sequel_confusion, different_content_type, etc.)
3. Recommendation: accept / reject / review

Return JSON only.
```

---

### 5.6 Quality Profile Matching

#### 5.6.1 Status: 🔲 PENDING

#### 5.6.2 Default Profiles

| Profile | Resolution | Min Bitrate | Max Size/min | Sources |
|---------|------------|-------------|--------------|---------|
| HD | 1080p | 4 Mbps | 75 MB | BluRay, WEB |
| Efficient-4K | 2160p | 8 Mbps | 130 MB | WEB only |
| HighQuality-4K | 2160p | 20 Mbps | 170 MB | BluRay, WEB |

#### 5.6.3 Size-to-Quality Validation

| Resolution | Min MB/min | Max MB/min | Red Flag |
|------------|------------|------------|----------|
| 720p | 5 | 32 | <3 or >50 |
| 1080p | 8 | 75 | <5 or >100 |
| 2160p | 20 | 170 | <15 or >250 |

---

### 5.7 Upgrade Polling

#### 5.7.1 Status: 🔲 PENDING

#### 5.7.2 Workflow

```
1. Scan library (or use cached FFprobe data)
2. For each item below target quality:
   a. Search indexer for candidates
   b. LLM verify each candidate
   c. Compare candidate vs current
   d. If better and within rate limits → queue
3. Process queue respecting rate limits
4. Log all decisions
```

#### 5.7.3 Configuration

```yaml
upgradePolling:
  enabled: true
  schedule: "0 3 * * *"         # 3 AM daily
  batchSize: 50                  # Items to evaluate per run
  minAgeHours: 48                # Don't upgrade files < 48h old
  requireConfirmation: false     # Auto-approve or require human
```

---

## 6. Configuration

### 6.1 Complete Configuration Reference

```yaml
# Curatarr Configuration
# Version: 0.1.0

#──────────────────────────────────────────────────────────────────────────────
# Library Paths
#──────────────────────────────────────────────────────────────────────────────
library:
  moviePaths:
    - /media/movies
  tvPaths:
    - /media/tv

#──────────────────────────────────────────────────────────────────────────────
# External Services
#──────────────────────────────────────────────────────────────────────────────
indexer:
  url: https://api.nzbgeek.info
  apiKey: ${INDEXER_API_KEY}
  categories:
    movies: [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060]
    tv: [5000, 5020, 5030, 5040, 5045, 5050, 5060]

sabnzbd:
  url: http://localhost:8080
  apiKey: ${SABNZBD_API_KEY}
  category: movies

jellyfin:
  url: http://localhost:8096
  apiKey: ${JELLYFIN_API_KEY}

tmdb:
  apiKey: ${TMDB_API_KEY}

llm:
  provider: openai                # openai | anthropic
  apiKey: ${OPENAI_API_KEY}
  model: gpt-4o
  temperature: 0.1
  maxTokens: 1024

#──────────────────────────────────────────────────────────────────────────────
# Quality Profiles
#──────────────────────────────────────────────────────────────────────────────
profiles:
  - name: HD
    resolution: 1080p
    minBitrate: 4000
    maxBitrate: 15000
    preferredBitrate: 8000
    minSize: 8
    maxSize: 75
    preferredSize: 30
    allowedCodecs: [x264, x265, hevc]
    allowedSources: [bluray, webdl, webrip]
    blockedGroups: []
    preferHdr: false

  - name: Efficient-4K
    resolution: 2160p
    minBitrate: 8000
    maxBitrate: 40000
    preferredBitrate: 20000
    minSize: 20
    maxSize: 130
    preferredSize: 70
    allowedCodecs: [x265, hevc, av1]
    allowedSources: [webdl, webrip]
    blockedGroups: []
    preferHdr: true

  - name: HighQuality-4K
    resolution: 2160p
    minBitrate: 20000
    maxBitrate: 80000
    preferredBitrate: 45000
    minSize: 45
    maxSize: 170
    preferredSize: 100
    allowedCodecs: [x265, hevc, av1]
    allowedSources: [bluray, webdl]
    blockedGroups: []
    preferHdr: true

#──────────────────────────────────────────────────────────────────────────────
# Rate Limiting
#──────────────────────────────────────────────────────────────────────────────
rateLimits:
  movies:
    maxPerDay: 10
    maxPerHour: 3
    cooldownMinutes: 30

  episodes:
    maxPerDay: 50
    maxPerHour: 10
    cooldownMinutes: 5

  global:
    maxConcurrent: 2
    pauseOnDiskSpaceMB: 50000

#──────────────────────────────────────────────────────────────────────────────
# Recycle Bin
#──────────────────────────────────────────────────────────────────────────────
recycleBin:
  enabled: true
  path: /media/.curatarr-recycle
  retentionDays: 30
  maxSizeGB: 500

  # ⚠️ DANGEROUS: Enable this only if you understand the risk
  allowPermanentDelete: false

#──────────────────────────────────────────────────────────────────────────────
# Upgrade Polling
#──────────────────────────────────────────────────────────────────────────────
upgradePolling:
  enabled: false
  schedule: "0 3 * * *"
  batchSize: 50
  minAgeHours: 48
  requireConfirmation: true

#──────────────────────────────────────────────────────────────────────────────
# Cache
#──────────────────────────────────────────────────────────────────────────────
cache:
  dbPath: ./data/curatarr.sqlite
  searchTtlHours: 24
  maxEntries: 50000

#──────────────────────────────────────────────────────────────────────────────
# Release Group Reputation
#──────────────────────────────────────────────────────────────────────────────
groupReputation:
  tier1:
    - BHDStudio
    - DON
    - FraMeSToR
    - HiFi
    - playBD
    - FLUX
    - TEPES
    - HONE
  tier2:
    - SPARKS
    - GECKOS
    - NTb
    - CMRG
    - SiGMA
  tier3:
    - YTS
    - YIFY
    - RARBG
    - EVO
  blocked:
    - aXXo
    - KLAXXON
    - MeGusta
```

---

## 7. User Interface

### 7.1 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CURATARR                                              [Settings] [Logs]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  HEALTH                     │  │  RATE LIMITS                        │  │
│  │  ───────                    │  │  ───────────                        │  │
│  │  ✓ Jellyfin      45ms       │  │  Movies:   3/10 today               │  │
│  │  ✓ Indexer       120ms      │  │  Episodes: 12/50 today              │  │
│  │  ✓ SABnzbd       32ms       │  │  Next reset: 6h 23m                 │  │
│  │  ✓ TMDB          89ms       │  │                                     │  │
│  │  ✓ LLM           250ms      │  │  [View Queue]                       │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LIBRARY ISSUES                                          [Scan Now]   │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  [Errors: 2]  [Warnings: 5]  [Info: 12]                               │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  ✗ Missing: Example Movie (2024)                                      │ │
│  │    /media/movies/Example Movie (2024)/file.mkv                        │ │
│  │    [Locate] [Remove from Jellyfin] [Dismiss]                          │ │
│  │  ───────────────────────────────────────────────────────────────────  │ │
│  │  ✗ Missing: Another Movie (2023)                                      │ │
│  │    /media/movies/Another Movie (2023)/                                │ │
│  │    [Locate] [Remove from Jellyfin] [Dismiss]                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  RECENT ACTIVITY                                                      │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  12:45  ✓ Upgraded: Movie A (720p → 1080p)                            │ │
│  │  12:30  ✓ Imported: Movie B (2024)                                    │ │
│  │  11:15  ✗ Rejected: Movie C (content mismatch: sports event)          │ │
│  │  10:00  ⚠ Rate limit reached, pausing upgrades                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Settings Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SETTINGS                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  General                                                                    │
│  ────────────────────────────────────────────────────────────────────────  │
│  Timezone:                    [America/New_York        ▼]                   │
│  Log Level:                   [Info                    ▼]                   │
│                                                                             │
│  Rate Limits                                                                │
│  ────────────────────────────────────────────────────────────────────────  │
│  Max movies per day:          [10        ]                                  │
│  Max episodes per day:        [50        ]                                  │
│  Cooldown (minutes):          [30        ]                                  │
│                                                                             │
│  Recycle Bin                                                                │
│  ────────────────────────────────────────────────────────────────────────  │
│  Recycle folder:              [/media/.curatarr-recycle                  ]  │
│  Retention (days):            [30        ]                                  │
│  Max size (GB):               [500       ]                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚠️ DANGER ZONE                                                      │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Allow permanent delete                              [ ] Enable     │   │
│  │  ───────────────────────────────────────────────────────────────── │   │
│  │  When enabled, you can permanently delete files without moving     │   │
│  │  them to the recycle bin. This action cannot be undone.            │   │
│  │                                                                     │   │
│  │  ⚠️ WARNING: Deleted files cannot be recovered.                     │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                                    [Cancel]  [Save]         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. API Reference

### 8.1 CLI Commands

```bash
# Scanning
curatarr scan [path]                    # Scan library with FFprobe
curatarr scan --profile HD              # Compare against profile
curatarr scan --report                  # Generate quality report

# Searching
curatarr search "Movie 2024"            # Search indexer
curatarr search --imdb tt1234567        # Search by IMDB ID
curatarr search --no-verify             # Skip LLM verification

# Downloading
curatarr grab <guid> --confirm          # Send to SABnzbd

# Cache
curatarr cache sync                     # Sync from indexer
curatarr cache stats                    # Show statistics
curatarr cache clear --confirm          # Clear cache

# Monitoring
curatarr monitor run                    # Full check
curatarr monitor health                 # Service health
curatarr monitor library                # Library integrity

# Rate Limits
curatarr limits status                  # Current usage
curatarr limits reset                   # Reset counters

# Recycle Bin
curatarr recycle list                   # List items
curatarr recycle restore <id>           # Restore item
curatarr recycle purge                  # Purge expired
curatarr recycle stats                  # Usage stats

# Upgrades
curatarr upgrade check                  # Check for upgrades
curatarr upgrade run                    # Run upgrade cycle
curatarr upgrade run --ignore-limits    # Ignore rate limits
```

### 8.2 REST API (Future)

```
GET  /api/health                        # Service health
GET  /api/library/issues                # Library issues
POST /api/library/scan                  # Trigger scan

GET  /api/search?q=...                  # Search releases
POST /api/grab                          # Grab release

GET  /api/limits                        # Rate limit status
POST /api/limits/reset                  # Reset limits

GET  /api/recycle                       # List recycled
POST /api/recycle/:id/restore           # Restore item
DELETE /api/recycle/:id                 # Permanent delete
```

---

## 9. Implementation Phases

### Phase 0: Monitoring ✅
- [x] Health checker
- [x] Jellyfin client
- [x] Library monitor
- [x] CLI commands

### Phase 1: Foundation
- [ ] FFprobe scanner
- [ ] Newznab indexer client
- [ ] SQLite cache layer
- [ ] Title parser

### Phase 2: Intelligence
- [ ] TMDB client
- [ ] LLM content verifier
- [ ] Quality profile matcher
- [ ] Size validation

### Phase 3: Download
- [ ] SABnzbd client
- [ ] Grab workflow
- [ ] Import handler
- [ ] Jellyfin rescan

### Phase 4: Automation
- [ ] Rate limiter
- [ ] Recycle bin
- [ ] Upgrade poller
- [ ] Notification system

### Phase 5: Web UI
- [ ] Dashboard
- [ ] Settings page
- [ ] Activity feed
- [ ] Search interface

### Phase 6: TV Support
- [ ] Episode parsing
- [ ] Season handling
- [ ] TVDB integration

### Phase 7: Jellyfin Plugin
- [ ] Quality badges
- [ ] Request integration
- [ ] In-app controls

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| CF | Custom Format (Radarr/Sonarr scoring system) |
| TRaSH | TRaSH Guides - community quality profiles |
| Newznab | Standard API for Usenet indexers |
| FFprobe | Tool to extract media file metadata |
| LLM | Large Language Model (GPT-4, Claude, etc.) |

### B. Related Documents

- [VISION.md](./VISION.md) - Original design vision
- [config.example.yaml](../config/config.example.yaml) - Configuration reference
- [CLAUDE.md](../CLAUDE.md) - Agent instructions

### C. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-28 | Name: Curatarr | Stays in *arr family, familiar |
| 2025-01-28 | Soft delete default | Prevent data loss |
| 2025-01-28 | Rate limiting | Prevent runaway upgrades |
| 2025-01-28 | LLM verification required | Core differentiator |
