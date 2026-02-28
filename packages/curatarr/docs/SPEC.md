# Curatarr Specification

> **Version**: 0.2.0-draft
> **Status**: Active development — open source project
> **Last Updated**: 2026-02-28

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
10. [Contributing](#10-contributing)
11. [Appendix](#appendix)

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
| Upgrade scout daemon | P1 | 🔲 Pending | 4 |
| Human intervention queue | P1 | 🔲 Pending | 4 |
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

### 5.7 Upgrade Scout Daemon

#### 5.7.1 Status: 🔲 PENDING

#### 5.7.2 Overview

The Upgrade Scout is a background daemon that runs on a configurable schedule, evaluates a batch of library items for upgrade opportunities, and takes action — either grabbing automatically or queuing items for human review.

**Design goals:**
- Time-bounded sessions (default: 30 min max) to avoid runaway API costs
- Configurable batch size (default: 10 movies per session)
- All decisions logged to SQLite for auditability
- Human-in-the-loop for ambiguous cases; fully autonomous for clear wins
- Pluggable LLM provider — defaults to Claude Sonnet for cost/quality balance

#### 5.7.3 Priority Selection

Each session evaluates up to `scout.moviesPerSession` (default: 10) candidates. Candidates are selected from the library using a composite priority score:

```
priority_score = quality_gap + recency_penalty + critic_weight + scout_age_bonus
```

| Component | Formula | Max |
|-----------|---------|-----|
| `quality_gap` | distance from current quality to profile target | 40 |
| `recency_penalty` | penalise recently-scouted items (linear decay over 14d) | −20 |
| `critic_weight` | `(MC/10) + (RT/10)` from Radarr ratings, capped | +20 |
| `scout_age_bonus` | +1 per day since last scout, capped at 20 | +20 |

**Quality gap calculation:**

| Current → Target | Gap Score |
|-----------------|-----------|
| CAM / TELESYNC → any | 40 |
| SD / 480p → HD/4K | 35 |
| 720p → 1080p or 4K | 30 |
| 1080p → 2160p (profile requires it) | 25 |
| YTS/LQ 4K → High-repute 4K | 20 |
| Same tier, suboptimal audio (AAC → Atmos) | 10 |
| Already at target | 0 (skip) |

**Selection filters (hard exclusions — never enter candidate pool):**
- File added within `scout.minAgeHours` (default: 48h)
- Item in Radarr download queue already
- Profile is `DontUpgrade`
- Explicitly dismissed via intervention queue within `scout.dismissCooldownDays` (default: 90)

#### 5.7.4 Scout Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SCOUT SESSION                                    │
│                                                                         │
│  1. SELECT candidates (priority ranking, hard filters)                  │
│  2. For each candidate (up to moviesPerSession):                        │
│     a. GET releases from indexer (search)                               │
│     b. Apply hard filters (quality tier, language, LQ groups)          │
│     c. Score and rank remaining releases                                │
│     d. LLM: content verification + quality authenticity check          │
│     e. Decision gate (see 5.7.5)                                        │
│        ├── AUTO-GRAB: push to download client                           │
│        └── INTERVENTION: write to SQLite queue                          │
│  3. Enforce time budget — stop if elapsed > scout.sessionMaxMinutes     │
│  4. Write scout_runs audit record                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Session time budget**: The daemon checks elapsed time before starting each new candidate evaluation. If `elapsed ≥ sessionMaxMinutes`, the session exits cleanly, logging how many were evaluated vs skipped.

#### 5.7.5 Auto-Grab vs Intervention Decision Matrix

Every candidate release passes through this gate. All conditions in the **Auto-grab** column must be true for automatic grabbing; any **Intervention trigger** condition routes to the human queue.

| Signal | Auto-grab condition | Intervention trigger |
|--------|-------------------|---------------------|
| LLM content confidence | ≥ 90% | < 90% |
| LLM quality authenticity | Pass (no size/quality anomaly) | Any flag raised |
| Release group repute | High (TRaSH-tiered or verified paid source) | Medium / Low / Unknown |
| Size sanity check | Within MB/min range for quality tier | Outside range |
| Protocol | Usenet preferred | Torrent-only → always intervention |
| Quality improvement | Unambiguous (clear tier jump or superior source) | Borderline (same tier, marginal gain) |
| Remux releases | Never auto-grab | Always intervention (size, confirm required) |
| Audio upgrade only | Auto if repute High and LLM passes | Otherwise intervention |
| New release (< 7 days) | Never auto-grab — indexer coverage incomplete | Always intervention |

**Decision priority**: a single Intervention trigger condition is sufficient to route to the queue regardless of how many Auto-grab conditions are met.

#### 5.7.6 SQLite Schema

The scout daemon uses two tables in the main Curatarr SQLite database.

```sql
-- Audit log: one row per scout session
CREATE TABLE scout_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  DATETIME NOT NULL,
  ended_at    DATETIME,
  status      TEXT NOT NULL DEFAULT 'running', -- running | completed | aborted
  movies_evaluated  INTEGER DEFAULT 0,
  auto_grabbed      INTEGER DEFAULT 0,
  interventions_added INTEGER DEFAULT 0,
  skipped     INTEGER DEFAULT 0,  -- hit time budget or already optimal
  error       TEXT                -- populated if status = aborted
);

-- Human intervention queue
CREATE TABLE interventions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id    TEXT NOT NULL,       -- Jellyfin/TMDB ID
  movie_title TEXT NOT NULL,
  movie_year  INTEGER,
  state       TEXT NOT NULL DEFAULT 'pending',
    -- pending | approved | grabbed | dismissed | expired
  reason      TEXT NOT NULL,       -- human-readable: why intervention needed
  priority    TEXT NOT NULL DEFAULT 'normal',
    -- critical | high | normal | low
  recommendation TEXT NOT NULL,    -- 'grab' | 'skip' | 'investigate'
  current_file    JSON,            -- { path, size, quality, group, added_at }
  candidate       JSON NOT NULL,   -- { guid, title, size, quality, group,
                                   --   repute, protocol, llm_confidence,
                                   --   score, download_url }
  all_candidates  JSON,            -- full ranked list (for UI display)
  scout_run_id    INTEGER REFERENCES scout_runs(id),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME,            -- auto-dismiss after this date
  resolved_at DATETIME,
  resolved_by TEXT,                -- 'user' | 'auto' | 'expired'
  notes       TEXT                 -- user-added notes on resolution
);

CREATE INDEX idx_interventions_state ON interventions(state);
CREATE INDEX idx_interventions_movie ON interventions(movie_id);

-- Rate limit counters (persisted across restarts)
CREATE TABLE rate_limit_counters (
  date  TEXT NOT NULL,
  type  TEXT NOT NULL,   -- 'movie' | 'episode'
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, type)
);
```

**Intervention `reason` examples:**

| Reason code | Human-readable message |
|-------------|----------------------|
| `llm_confidence_low` | LLM content confidence 74% — may not be correct movie |
| `unknown_group` | Release group DVSUX has no TRaSH history or verified source |
| `torrent_only` | No usenet NZB available; torrent from KyoGo found |
| `remux_available` | FraMeSToR Remux-2160p 61.6 GB — confirm before push |
| `size_anomaly` | 1.8 GB for 2160p (expected 20–170 GB) — likely mislabeled |
| `new_release` | Released 3 days ago — indexer coverage may be incomplete |
| `borderline_gain` | Same quality tier, marginal audio upgrade only |

#### 5.7.7 Configuration

```yaml
scout:
  enabled: true
  schedule: "0 3 * * *"          # Cron: 3 AM daily
  sessionMaxMinutes: 30           # Hard time budget per session
  moviesPerSession: 10            # Max candidates per session
  minAgeHours: 48                 # Min file age before scouting
  dismissCooldownDays: 90         # Re-surface dismissed after N days
  interventionExpiryDays: 14      # Auto-expire pending items after N days

  llm:
    provider: anthropic           # anthropic | openai | ollama
    model: claude-sonnet-4-6      # Model for scout evaluations
    maxTokensPerSession: 50000    # Cost guard: abort if exceeded
    temperature: 0.1

  autoGrab:
    enabled: true                 # false = dry-run mode (all → intervention)
    requireMinRepute: high        # high | medium — minimum group repute
    requireUsenet: false          # true = never auto-grab torrents
```

#### 5.7.8 CLI

```bash
# Run scout now (ignores schedule)
curatarr scout run

# Run in dry-run mode (no grabs, all decisions logged only)
curatarr scout run --dry-run

# Show last session summary
curatarr scout status

# Show pending intervention queue
curatarr scout queue

# Show all queue items (include dismissed/expired)
curatarr scout queue --all

# Approve item (grab the recommended release)
curatarr scout approve <id>

# Approve with alternative (choose different candidate)
curatarr scout approve <id> --rank 2

# Dismiss item (not interested in upgrading)
curatarr scout dismiss <id> [--reason "Already acceptable quality"]

# Batch operations
curatarr scout approve-all --dry-run     # Preview what would be grabbed
curatarr scout approve-all              # Grab all approved items
curatarr scout dismiss-expired          # Purge stale queue entries

# Audit log
curatarr scout history [--days 30]      # Scout run history
curatarr scout history --verbose        # Full session details
```

**Queue display format:**

```
INTERVENTION QUEUE — 3 pending

 ID  PRIORITY  TITLE                       YEAR  REASON                        RECOMMENDATION
  1  high      Ghost in the Shell          1995  remux_available (61.6 GB)     grab (confirm)
  2  normal    Alien: Romulus              2024  new_release (4 days old)      skip (wait)
  3  normal    The Substance               2024  torrent_only (FLUX, usenet!)  grab (torrent)

curatarr scout approve 1   # → show remux details, ask for explicit confirm
curatarr scout approve 3   # → warn ⚠ TORRENT ONLY, show SABnzbd alternative
curatarr scout dismiss 2   # → re-surfaces in 90 days
```

---

### 5.8 Adapter Architecture

#### 5.8.1 Purpose

Curatarr is designed as an open-source tool for the broader self-hosted media community. Hard-coding a single download client, indexer, or media server would limit adoption. The adapter pattern lets operators swap components without forking.

#### 5.8.2 LLM Provider Adapters

All LLM calls go through a common `LLMProvider` interface:

```typescript
interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], opts?: LLMOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
}
```

| Provider | Model default | Notes |
|----------|-------------|-------|
| `anthropic` | `claude-sonnet-4-6` | Default; best cost/accuracy balance |
| `openai` | `gpt-4o` | Good alternative |
| `ollama` | `llama3.3` | Local; no API cost, slower |
| `openrouter` | configurable | Aggregator; many models |

Config:
```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-6
  apiKey: ${ANTHROPIC_API_KEY}
```

#### 5.8.3 Download Client Adapters

```typescript
interface DownloadClient {
  name: string;
  addNzb(url: string, category: string, name: string): Promise<string>;  // returns job ID
  addTorrent(url: string, category: string, name: string): Promise<string>;
  getQueue(): Promise<DownloadJob[]>;
  removeJob(id: string): Promise<void>;
}
```

| Client | Protocol | Notes |
|--------|---------|-------|
| `sabnzbd` | Usenet | Default; full API |
| `nzbget` | Usenet | Alternative usenet client |
| `qbittorrent` | Torrent | Full WebUI API |
| `transmission` | Torrent | Lightweight alternative |
| `deluge` | Torrent | Plugin-based |

#### 5.8.4 Indexer Adapters

```typescript
interface IndexerAdapter {
  name: string;
  search(query: string, categories: number[]): Promise<Release[]>;
  getById(guid: string): Promise<Release>;
  isAvailable(): Promise<boolean>;
}
```

| Adapter | Notes |
|---------|-------|
| `newznab` | Standard Newznab/Torznab API (NZBGeek, NZBFinder, Prowlarr) |
| `torznab` | Torrent variant of Newznab (via Prowlarr or Jackett) |
| `prowlarr` | Preferred — aggregates multiple indexers with CF scoring |

Using Prowlarr as the indexer adapter means Curatarr inherits CF scoring from the existing TRaSH sync. This is the recommended path during transition from the full *arr stack.

#### 5.8.5 Media Server Adapters

```typescript
interface MediaServerAdapter {
  name: string;
  getLibraryItems(type: 'movie' | 'episode'): Promise<LibraryItem[]>;
  triggerScan(path: string): Promise<void>;
  updateMetadata(id: string, meta: Partial<MediaMeta>): Promise<void>;
}
```

| Adapter | Notes |
|---------|-------|
| `jellyfin` | Default; full API, no API key tier restrictions |
| `plex` | Requires Plex Pass for full API access |
| `emby` | Similar API surface to Jellyfin |

---

### 5.9 Observability

#### 5.9.1 Structured Logging

All log output is structured JSON when `LOG_FORMAT=json` (default in production/Docker) or human-readable when `LOG_FORMAT=pretty` (default in development).

```json
{
  "time": "2026-02-28T03:15:42Z",
  "level": "info",
  "module": "scout",
  "event": "candidate_evaluated",
  "movie": "Ghost in the Shell",
  "year": 1995,
  "decision": "intervention",
  "reason": "remux_available",
  "candidate_group": "FraMeSToR",
  "candidate_size_gb": 61.6,
  "llm_confidence": 98,
  "elapsed_ms": 3240
}
```

#### 5.9.2 SQLite Audit Trail

Beyond the scout tables, all grab and import actions are logged:

```sql
CREATE TABLE activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type        TEXT NOT NULL,  -- grabbed | imported | recycled | rejected | error
  movie_id    TEXT,
  movie_title TEXT,
  release     TEXT,           -- release filename
  details     JSON,           -- type-specific payload
  source      TEXT            -- 'scout' | 'cli' | 'api'
);
```

#### 5.9.3 Health Endpoint

When running as a daemon, Curatarr exposes a minimal health endpoint:

```
GET /health
→ { status: "healthy", lastScout: "2026-02-28T03:15:55Z", queueDepth: 3 }
```

Suitable for Docker HEALTHCHECK and uptime monitors.

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

# Upgrades / Scout
curatarr upgrade check                  # Check for upgrades (legacy alias)
curatarr upgrade run                    # Run upgrade cycle (legacy alias)
curatarr scout run                      # Run scout session now
curatarr scout run --dry-run            # Preview decisions only
curatarr scout status                   # Last session summary
curatarr scout queue                    # Pending intervention queue
curatarr scout approve <id>             # Approve and grab
curatarr scout dismiss <id>             # Dismiss (resurfaces after cooldown)
curatarr scout history                  # Session audit log
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

### Phase 4: Automation & Scout
- [ ] Rate limiter (SQLite-backed counters)
- [ ] Recycle bin (soft delete + retention policy)
- [ ] Upgrade Scout daemon (priority selection, session lifecycle)
- [ ] Human intervention queue (SQLite schema, CLI approve/dismiss)
- [ ] Auto-grab decision gate (LLM confidence + repute thresholds)
- [ ] Scout session audit log (`scout_runs` table)
- [ ] Adapter interfaces (LLM, download client, indexer, media server)
- [ ] Notification system (webhook / ntfy / Apprise)

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

---

## 10. Contributing

### 10.1 Philosophy

Curatarr is designed to be understandable and extendable. The codebase follows a module-per-concern pattern — each integration is isolated behind an adapter interface, so contributors can add support for new download clients, indexers, or media servers without touching core logic.

### 10.2 Architecture for Contributors

```
src/
├── adapters/               # Swap-in implementations
│   ├── llm/                # LLM provider adapters
│   │   ├── anthropic.ts    # Default
│   │   ├── openai.ts
│   │   └── ollama.ts       # Local LLM (no API key)
│   ├── download/           # Download client adapters
│   │   ├── sabnzbd.ts      # Default for usenet
│   │   ├── nzbget.ts
│   │   └── qbittorrent.ts
│   ├── indexer/            # Indexer adapters
│   │   ├── newznab.ts      # Standard Newznab
│   │   ├── torznab.ts      # Torrent Newznab
│   │   └── prowlarr.ts     # Prowlarr aggregator (recommended)
│   └── media-server/       # Media server adapters
│       ├── jellyfin.ts     # Default
│       └── plex.ts
├── scout/                  # Upgrade Scout daemon
│   ├── daemon.ts           # Scheduler + session lifecycle
│   ├── prioritizer.ts      # Candidate priority ranking
│   ├── decisionGate.ts     # Auto-grab vs intervention logic
│   └── interventionQueue.ts # SQLite queue management
└── shared/
    └── adapters.ts         # Adapter interfaces (the contracts)
```

### 10.3 Adding a New Adapter

1. Implement the relevant interface from `src/shared/adapters.ts`
2. Add a factory case in `src/shared/adapterFactory.ts`
3. Add configuration type in `config.schema.ts`
4. Write a test that mocks the external API (see `test/adapters/`)
5. Update `config.example.yaml` with the new provider option

**Example — adding an NZBGet download client:**

```typescript
// src/adapters/download/nzbget.ts
import type { DownloadClient, DownloadJob } from '../../shared/adapters.js';

export class NzbGetClient implements DownloadClient {
  name = 'nzbget';

  constructor(private url: string, private username: string, private password: string) {}

  async addNzb(nzbUrl: string, category: string, name: string): Promise<string> {
    // POST to NZBGet JSONRPC API
    const res = await fetch(`${this.url}/jsonrpc`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}` },
      body: JSON.stringify({ method: 'append', params: [name, nzbUrl, category, 0, false, false, '', 0, 'SCORE'] }),
    });
    const { result } = await res.json();
    if (result < 0) throw new Error(`NZBGet append failed: ${result}`);
    return String(result);
  }

  // ... other interface methods
}
```

### 10.4 Code Style

- **ESM only**: `.js` extension in imports, `"type": "module"` in package.json
- **No default exports**: named exports only for tree-shaking
- **Structured errors**: return `{ ok: false, error: string }` from library code; throw only from CLI entry points
- **No `any`**: use `unknown` and narrow with type guards
- **Tests required**: every adapter must have a test file mocking the external HTTP API

### 10.5 Testing

```bash
npm test                    # Node built-in test runner
npm test -- --watch         # Watch mode (Node 22+)
```

Test structure:
```
test/
├── adapters/
│   ├── sabnzbd.test.ts     # Mock HTTP, test all methods
│   └── prowlarr.test.ts
├── scout/
│   ├── prioritizer.test.ts # Priority scoring logic
│   └── decisionGate.test.ts # Auto-grab vs intervention rules
└── shared/
    └── titleParser.test.ts  # Pure parsing, no mocks needed
```

### 10.6 Roadmap for Community Contributions

The following areas are explicitly **open for community contribution** (will not be blocked by core maintainers):

| Area | Complexity | Notes |
|------|-----------|-------|
| Additional LLM adapters (Mistral, Gemini, OpenRouter) | Low | Follow `anthropic.ts` as template |
| NZBGet download client | Low | JSON-RPC API |
| Transmission / Deluge torrents | Low | Simple APIs |
| Plex media server adapter | Medium | Requires Plex token handling |
| Pushover / ntfy notifications | Low | Simple HTTP POST |
| Web UI (React or Vue) | High | REST API already specced in 8.2 |
| TV show support (TVDB) | High | New content type |
| Jellyfin plugin | Very High | Requires C# knowledge |

### 10.7 Non-Goals (Scope Boundaries)

To keep Curatarr focused and maintainable, the following are explicitly out of scope:

- **Content discovery / recommendations**: Curatarr manages what you already have or explicitly request; it does not suggest new content
- **Streaming or transcoding**: Jellyfin handles this; Curatarr is an acquisition and quality management tool
- **Rights management or DRM**: Configuration of legal acquisition sources is the operator's responsibility
- **Multi-user access control**: Single-operator tool; multi-user is a future concern (Web UI phase)

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
| 2026-02-28 | Scout daemon uses Claude Sonnet | Best cost/quality balance for batch evaluation; configurable to other providers |
| 2026-02-28 | Remux = always intervention, never auto-grab | File sizes (40–80 GB) require human confirmation regardless of repute |
| 2026-02-28 | Torrent-only = always intervention | Usenet is strongly preferred; torrents need explicit user sign-off |
| 2026-02-28 | 30-minute session budget | Prevents runaway API costs; configurable per operator |
| 2026-02-28 | Adapter pattern for all external services | Open-source portability — operators shouldn't need to fork for different stacks |
| 2026-02-28 | SQLite for intervention queue and audit log | Zero-dependency embedded DB; snapshots easily via `cp`; sufficient for single-operator scale |
| 2026-02-28 | RT is primary critic signal; IMDb fallback | RT aligns better with critical consensus for exceptional title classification; IMDb votes used as corroboration only |
