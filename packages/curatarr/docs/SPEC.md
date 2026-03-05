# Curatarr Specification

> **Version**: 0.2.0-draft  
> **Status**: Active development  
> **Last Updated**: 2026-02-28

---

## 1. Overview

**Curatarr** is a media library management system powered by Large Language Models (LLM). It aims to simplify and modernize the stack currently managed by tools like Radarr, Recyclarr, and eventually Sonarr, by providing an intelligent, unified solution.

**Key Integrations:**  
- Media server: Jellyfin  
- Indexer manager: Prowlarr  
- Download clients: SABnzbd, qBittorrent

Curatarr consolidates functionalities, removes manual config drift issues, and integrates features such as quality validation (via FFprobe), semantic verification (via LLM), and opinionated scoring rules—all with a focus on reliability and simplicity.

---

## 2. What Makes Curatarr Different?

| Traditional Stack                   | Curatarr                             |
|-------------------------------------|--------------------------------------|
| Multiple apps: Radarr, Recyclarr    | Single unified app                   |
| Rule-based matching                 | LLM verification (semantic checking) |
| Filename-only checks                | FFprobe and content validation       |
| Complex, manual config sync         | Automatic, YAML-based, UI-editable   |
| Recyclarr for TRaSH profiles        | Built-in TRaSH sync                  |
| Additive/manual scoring             | Ordered YAML scoring rules + size/quality checks |

Stack before: Jellyfin + Radarr + Recyclarr + Prowlarr + SABnzbd + qBittorrent  
Stack after:  Jellyfin + Curatarr + Prowlarr + SABnzbd + qBittorrent

---

## 3. Core Features

- **LLM Content Verification:** Prevents wrong upgrades (e.g., avoids "F1" movie/race mix-ups)
- **Integrated Quality Checking:** Uses FFprobe for hard validation of video/audio claims
- **TRaSH Guide Sync:** Keeps custom formats and group reputations updated, replaces Recyclarr
- **User Intervention Queue:** Manual review for edge cases (e.g., Remux, Torrent-only)
- **Rate Limiting:** Prevents runaway downloads/updates
- **Soft Delete / Recycle Bin:** Prevents accidental data loss
- **Open Adapter Pattern:** Easy to add more indexers, downloaders, or LLM providers
- **Web UI:** Modern, responsive, with batch and filter operations

---

## 4. Technical Architecture

See [Technical Architecture Diagram](./technical/architecture.md) for details.  
Curatarr is modular: adapters for indexer, download clients, LLM, and media servers.

Main flows:
1. **Monitor Library** (scan Jellyfin, detect missing/duplicate/issue files)
2. **Scout/Suggest Upgrades** (prioritize based on profile & actual quality; uses LLM for verification)
3. **Human-in-the-loop** (for ambiguous or high-impact upgrades)
4. **Automated Actions** (downloads, imports, recycle, metadata updates)

All rules/scoring logic are open, human-readable, ordered YAML. Full QA/audit trail in SQLite.

---

## 5. Configuration

Configuration is YAML-based, file or UI editable. See the [example config](../config/config.example.yaml) for full reference.

**Key Config Sections:**
- Library paths for movies/TV
- Indexer, download client, media server addresses/API keys
- Quality profiles (resolutions, minimum/maximum sizes, allowed codecs/sources)
- TRaSH/CF group sync settings
- Rate limits (per day/hour, cooldowns)
- LLM provider and model
- Recycle bin options

All API/LLM keys are securely stored or can be set via environment variables.

---

## 6. Usage Essentials

- **CLI** and **Web UI** available for all core operations
- **Scanning:** `curatarr scan` — run FFprobe on all library media
- **Upgrade/Scout:** `curatarr scout run` — propose or auto-perform upgrades, with LLM and hard checks
- **Monitoring:** `curatarr monitor` — check library and connected services health
- **Trash/Recycle:** `curatarr recycle` — view, restore, permanently remove soft-deleted files
- **Settings:** API keys, rate limits, scoring rules, and more editable directly in the UI

See `curatarr --help` or the [API docs](#8-api-reference) for all commands and endpoints.

---

## 7. Contribution & Extending

Curatarr is designed for modularity and community development.
- **Adapters:** Add support for new download clients, indexers, or LLM providers by implementing an adapter interface (see [technical/architecture.md](./technical/architecture.md))
- **Testing:** Mock external APIs for adapter tests. Unit and integration tests required for new modules.
- **Code Style:** ESM-only; no default exports; structured errors; no use of `any` type.
- **Contribution areas:** New indexer/download/LLM adapters, TV support, webhooks, UI enhancements, and more (see repo and issue tracker).

---

## 8. Appendix

- [VISION.md](./VISION.md): Original project vision
- [ARCHITECTURE.md](./technical/architecture.md): Detailed system and module structure
- [config.example.yaml](../config/config.example.yaml): Full configuration reference
- [CLAUDE.md](../CLAUDE.md): LLM prompt/agent details

**Glossary:**  
- CF: Custom Format (scoring system from Radarr/Sonarr)  
- TRaSH: Community-maintained quality profile/CF definitions  
- LLM: Large Language Model (ChatGPT, Claude, etc.)  
- FFprobe: Tool for verifying media file technical details

---

## 9. Notable Design Decisions

- LLM verification is required for upgrades — avoids content mix-ups
- Remux upgrades are never automatic (always require manual review)
- Torrents are always subject to manual intervention by default
- All adapter interfaces are swappable (operator can use their own LLM/indexer/etc. without forking)
- TRaSH sync builds group and quality tiers automatically; config can override
- API keys are user-supplied, not bundled in app/config
- All logs, actions, and decisions are stored in structured format for audit and transparency

---

Curatarr's goal: a reliable, opinionated, transparent media management tool that's open for extension and doesn't require operator heroics to trust.
For deeper technical details, module structure, and advanced usage, refer to [Technical Architecture Diagram](./technical/architecture.md) and linked docs.

