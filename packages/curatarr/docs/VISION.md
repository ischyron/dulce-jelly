# Curatarr — Open Source Media Library Curation


## Vision

Curatarr is an open source movie library management tool focused on empowering home media communities to achieve intelligent, safe, and easily reproducible quality upgrades and curation.

Support for TV series is planned, but the current focus is movies.

Curatarr is not a metadata presentation suite; it stores only the metadata crucial for curation and quality decisions. Jellyfin continues as the source of truth and frontend for browsing and playback.

## Core Values (2026 refresh)

- **Authenticity over claims** — prioritize real ffprobe metrics, sensible size-to-quality checks, and traceable release origins above self-reported labels.
- **Human-in-the-loop safety** — always prefer explicit user confirmation for actions, and provide clear explanations for every decision.
- **Open-source alignment** — compatible with Jellyfin/Prowlarr/SABnzbd/qBittorrent; no closed dependencies or black-box logic.
- **Resilience for self-hosters** — deterministic configuration, portable paths, cautious deletes, and observable tasks (e.g., SSE and logs).
- **Enthusiast UX** — advanced filtering, consistent API/UI stats, compatibility info (AV1/DV/HDR) surfaced up front.

## Summary

**Curatarr** unifies fragmented *arr-based media workflows into a single curation layer with modern quality intelligence. Prowlarr remains the indexer manager; Curatarr introduces robust, transparent scoring and optional LLM-based tie-breaking for edge cases where near-equivalent releases require judgment.

**Core insight:** Deterministic scoring can reach ties and ambiguous picks. Curatarr applies explainable LLM evaluation only as a tiebreaker, preserving predictability and user trust.

---

## Why Curatarr?

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

### Where Existing Tools Fall Short

- TRaSH overrides and custom format tweaks require duplication across multiple tools.
- Similar scores result in unreliable automation or tedious manual review of near-identical releases.
- Decision logic diverges between tools, creating maintenance drift and effort.
- Automated upgrades can make mistaken choices between equally-appearing releases.

### Real-World Failure Cases

**UC-1: The F1 Incident**
> Radarr upgraded "F1" (2025 Brad Pitt movie) but actually replaced it with a Formula 1 Abu Dhabi Grand Prix race. Completely different and wrong content.

**Root cause:** Radarr relies on simple string title matching; it cannot distinguish semantic intent. "F1" mapped to multiple unrelated releases.

**UC-2: Fake Quality Claims**
> A "4K HDR Remux" from an unknown group at 2GB passed quality scoring just because it had the right keywords, while the file was obviously a fake.

**Root cause:** Additive scoring methods can be gamed by keyword stuffing, ignoring physical implausibility.

**UC-3: Suboptimal Upgrades**
> Automatic upgrade replaced an AMZN WEB-DL with a slightly higher-scoring WEB from an unknown source, but the actual quality was worse (encode-of-encode).

**Root cause:** Scoring logic did not consider source lineage or real encode quality, only matching criteria.

---

## What Radarr Actually Does

Research into Radarr’s source code yields:

| Capability | How It Works |
|------------|--------------|
| **File analysis** | Uses FFprobe via FFMpegCore (not just filename parsing) |
| **Resolution detection** | Reads actual video dimensions from file |
| **Codec/HDR detection** | Extracts from file streams |
| **Quality augmentation** | 5 augmenters: filename, folder, download client, MediaInfo (highest confidence), release name |

**What Radarr does NOT do:**
- Bitrate-based quality selection (feature request marked "Won't Fix")
- LLM-backed content verification
- Release content type understanding
- Size-to-quality sanity checks beyond filename parsing

**Key insight:** The analysis pipeline is decent; the decision logic and scoring model are the core limitation.

---

## The Curatarr Proposal

### How Curatarr Differs

| Traditional stack | Curatarr |
|------------------|----------|
| Multiple config and scoring systems | Unified decision layer |
| Hard rule-based tie-breaks | Deterministic logic, optional LLM explainable tie-break |
| Filename-only content match | Semantic, metadata-based verification |
| Additive scoring only | TRaSH + user-defined + metadata-informed scoring |
| Prowlarr manages indexers | Prowlarr still integrated |
| Complex setup | Quality profiles and rules built-in |

### What Sets Curatarr Apart

1. **LLM Content Verification**
   - Prevents wrong-content replacements (e.g., F1 confusion)
   - Understands movie vs TV vs broadcast
   - Detects sequel/remake errors

2. **Quality Authenticity Checks**
   - Validates claimed size vs plausible bitrate for reported resolution
   - Leverages known group reputations
   - Flags obviously inauthentic releases

3. **Real File Quality Assessment**
   - Full ffprobe of all local files for accurate evaluation
   - Bitrate-aware decisions, not just resolution
   - Upgrade logic prioritizes true improvements

4. **Simple, Single-Source Logic**
   - No need for Radarr or Recyclarr: one system replaces both
   - Prowlarr for indexers; Jellyfin for library state
   - Downloaders like SABnzbd/qBittorrent still supported

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             CURATARR                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        LLM EVALUATOR                           │    │
│  │  • Content identity verification                               │    │
│  │  • Quality authenticity assessment                             │    │
│  │  • Upgrade worthiness analysis                                 │    │
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
│  │                      QUALITY ENGINE                            │    │
│  │  • TRaSH rules (integrated)   • Release group reputation       │    │
│  │  • Profile definitions        • Size/bitrate validation        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         WEB UI                                 │    │
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
   │ Jellyfin │        │ SABnzbd  │         │ Prowlarr │
   │ (library │        │ (downld) │         │ (indexer)│
   │ + player)│        └──────────┘         └──────────┘
   └──────────┘
```

---

## Core Workflows

### 1. Library Quality Audit

Scan your existing library and evaluate actual file quality.

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

Query the indexer, then apply Curatarr’s verification and ranking.

```
User: curatarr search "F1 2025" --profile Efficient-4K
    ↓
Query Prowlarr (Newznab/Torznab API)
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

Download only after your explicit confirmation.

```
Review proposed results
    ↓
curatarr grab <guid> --confirm
    ↓
Send NZB to SABnzbd
    ↓
Log action (audit trail)
    ↓
Return job ID
```

### 4. Post-Download Import

Handle and verify completed downloads.

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

Periodically check for possible upgrades.

```
Scheduled: curatarr poll --batch 10
    ↓
For each movie in library:
  ├─ Gather actual metrics (ffprobe)
  ├─ Compare to profile target
  │
  ├─ If upgrade is possible:
  │   ├─ Search indexer for candidates
  │   ├─ LLM verification on each
  │   ├─ Compare candidate vs current
  │   │   • Same source? Better encode?
  │   │   • Worth file size change?
  │   └─ Propose upgrade for review, or auto-approve with high confidence
  │
  └─ Log the decision
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

- Prowlarr-based Newznab/Torznab queries
- SQLite cache for search results
- Title parsing (TRaSH patterns)
- Release group reputation factors

### LLM Evaluator (`evaluator/`)

```typescript
interface LLMEvaluation {
  contentMatch: {
    confidence: number;        // 0–100
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

**LLM Prompt Outline:**

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
2. Quality authenticity: Is the size appropriate for its quality claim?
3. Upgrade value: (if applicable) Is this file an actual improvement?

Return JSON with confidence scores and reasoning.
```

### Quality Engine (`quality/`)

- Integrated TRaSH rules (no separate Recyclarr)
- Built-in profiles: HD, Efficient-4K, HighQuality-4K
- Bitrate/size validation tables
- Group reputation tiers

### Download Manager (`download/`)

- SABnzbd API support
- qBittorrent API support
- Grab audit logging
- Webhook for completed downloads

### Import Handler (`import/`)

- TMDB metadata lookup
- Folder names: `{Title} ({Year}) {imdb-{ImdbId}}`
- File move/copy & verify
- Jellyfin API for rescanning

### Web UI (`web/`)

| View | Purpose |
|------|---------|
| **Library** | Browse with quality overlays |
| **Quality Analysis** | See candidates/upgrades, distribution |
| **Activity Feed** | Every decision logged |
| **Search** | Semantic search and verification display |
| **Settings** | Profiles, indexers, LLM setup |

---

## Stack Comparison

### Before (Typical Self-Host Stack)

| Service | Purpose | Status |
|---------|---------|--------|
| Jellyfin | Library + Player | Keep |
| Jellyseerr | Requests | Optional; Keep if used |
| Radarr | Movies | **Replace** |
| Sonarr | TV Shows | **Replace** |
| Prowlarr | Indexer manager | Keep |
| Recyclarr | Rule sync | **Replace** |
| SABnzbd | Usenet | Keep |
| qBittorrent | Torrents | Keep |
| Caddy | Reverse proxy | Keep |

### After (Curatarr stack)

| Service | Purpose |
|---------|---------|
| Jellyfin | Library + Player |
| Curatarr | Curation, search, import, upgrade logic |
| Prowlarr | Indexer manager |
| SABnzbd | Usenet downloads |
| qBittorrent | Torrents |
| Caddy | Reverse proxy |

_Fewer containers and a simpler, maintainable stack._

---

## Jellyfin Integration

### Option A: Jellyfin Plugin

- Add "Quality" badges to library entries
- Show upgrade opportunities
- "Send to Curatarr" button for new grabs
- (Possible) replace Jellyseerr for requests

### Option B: API Integration

- Curatarr polls Jellyfin for the current library state
- Triggers Jellyfin rescan after importing new media
- Jellyseerr can remain for requests (if desired)

**Start with Option B — lightweight and bridges easily. Add plugin support later.**

---

## Design Principles

| Decision | Approach | Reasoning |
|----------|----------|-----------|
| Sync | On-demand only | Users run `curatarr sync` as needed; not backgrounded automatically |
| Indexer | Just Prowlarr for MVP | Direct Newznab adapters later, as needed |
| REST API | Not for MVP | CLI-first; API arrives with Web UI |
| Downloads | Always user-confirmed | `--confirm` required for legal safety and user control |
| Scope | Movies First | Series/TV add later, due to added complexity |
| Prowlarr | Retained | Still acts as consolidated indexer manager |
| *arr logic | Radarr/Sonarr/Recyclarr replaced | All curation now handled by Curatarr |

---

## Implementation Phases

### Phase 1: Core CLI (MVP)
- [ ] Library scanning (ffprobe metrics)
- [ ] Indexer support (Prowlarr API)
- [ ] Title parsing (TRaSH style)
- [ ] SQLite-based cache
- [ ] CLI: `scan`, `search`, `cache-stats`

### Phase 2: Quality Intelligence
- [ ] Quality profiles
- [ ] Bitrate/size validation
- [ ] Group reputation
- [ ] Simplified TRaSH scoring

### Phase 3: LLM Verification
- [ ] TMDB client
- [ ] Structured prompt templates
- [ ] Quality authenticity checks
- [ ] Confidence reporting

### Phase 4: Grab & Import
- [ ] SABnzbd client
- [ ] CLI: `grab <guid> --confirm`
- [ ] Import webhook handler
- [ ] Naming/organizing imports
- [ ] Jellyfin rescan support

### Phase 5: Upgrade Polling
- [ ] Background polling workflow
- [ ] Old/new comparison for upgrades
- [ ] Auto-approval with high confidence, else user review
- [ ] Notifications

### Phase 6: Web UI
- [ ] Activity feed
- [ ] Library view with quality overlays
- [ ] Search interface
- [ ] Settings management

### Phase 7: TV Support
- [ ] Series/episode parsing
- [ ] TVDB integration
- [ ] Season pack detection

### Phase 8: Jellyfin Plugin
- [ ] Quality badges in UI
- [ ] Request workflow
- [ ] Upgrade notices

---

## Recommended Project Structure

```
curatarr/
├── src/
│   ├── cli/
│   ├── scanner/
│   ├── search/
│   ├── evaluator/
│   ├── quality/
│   ├── download/
│   ├── import/
│   ├── web/
│   └── shared/
├── test/
├── docs/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── package.json
```

---

## What Success Looks Like

1. **Fewer content replacement mistakes:** verification and matching avoid wrong-title or wrong-version swaps.
2. **Better accuracy:** actual bitrates and quality metrics align with stated tiers and release claims.
3. **Simplicity:** fewer containers and services (e.g. Radarr/Recyclarr replaced by one system).
4. **Trustworthy recommendations:** suggestions backed by deterministic rules plus optional LLM rulesets so users can rely on Curatarr without always manually reviewing.
