# Opinionated Radarr Quality Profile 

This opinionated set powers the four Radarr profiles (`AutoAssignQuality`, `HD`, `Efficient-4K`, `HighQuality-4K`), the quality-definition caps (MB/min), and the upgrade/scoring logic tuned to Trash/Usenet norms. 

For setup steps and sync instructions, see the [Service Setup Guide → Automation (Recyclarr + Quality Broker)](./service-setup-guide.md#automation-recyclarr--quality-broker).

## Units and conversions
- Radarr size limits are **MB per minute**. To visualize bitrate: `MB/min × 0.1333 ≈ Mbps`.
- Examples: 10 MB/min ≈ 1.33 Mbps; 35 MB/min ≈ 4.67 Mbps; 110 MB/min ≈ 14.7 Mbps.

## Blocked tiers (all profiles)
- `HDTV-720/1080/2160` and `Remux-1080/2160` use `min:0, pref:1, max:1` → deterministic reject while keeping Trash registry intact. 
- `Remux` is also parsed as custom format (CF) and assigned -1000 to safely block from scoring.

## Quality-definition caps (per quality)
- Values below are **min / preferred / max (MB/min)** and the approximate max bitrate (Mbps):

### 720p (fallback only)
Rare cases when you need 720p. Ideally for modern day TV clients 720p is not preferred.
- `WEBRip-720p`: 5 / 9 / 16 → max ≈ 2.1 Mbps (small HEVC WEB rips only).
- `WEBDL-720p`: 6 / 10 / 18 → max ≈ 2.4 Mbps (tighter cap to avoid bloated 720p WEB-DL).
- `Bluray-720p`: 9 / 15 / 26 → max ≈ 3.5 Mbps (only for legacy libraries; default disabled in profiles).

### 1080p (primary HD tier)
Not so great titles but still worthy of collection goes here.
- `WEBRip-1080p`: 4 / 8 / 18 → max ≈ 2.4 Mbps (keeps small encodes viable while capping poor sources).
- `WEBDL-1080p`: 8 / 12 / 20 → max ≈ 2.7 Mbps (preferred over WEBRip; still efficiency-focused HEVC targets).
- `Bluray-1080p`: 12 / 18 / 40 → max ≈ 5.3 Mbps (allows cleaner disc encodes without inviting bloat).

### 2160p / 4K (efficiency-first with controlled UHD)
- `WEBRip-2160p`: 12 / 28 / 60 → max ≈ 8.0 Mbps (keeps compact 4K streams acceptable; rejects under/oversized rips).
- `WEBDL-2160p`: 18 / 35 / 70 → max ≈ 9.3 Mbps (preferred WEB source for 4K; balances quality and size).
- `Bluray-2160p`: 40 / 110 / 160 → max ≈ 21.3 Mbps (permits well-encoded UHD Bluray while bounding giant remux-like encodes).

## Profile intents and ordering

### AutoAssignQuality
- Intake/hold only. `Unknown` enabled (blocked by size cap ~1 MB/min) to satisfy Radarr’s required allowed quality. All other tiers disabled.

### HD (1080p-first)
- Ordering: `WEBDL-1080p` > `WEBRip-1080p` > `Bluray-1080p` (Bluray allowed but WEBDL is the upgrade target). 720p tiers remain disabled by default.
- Gates: `min_format_score 15`, `min_upgrade_format_score 35`, upgrade until `WEBDL-1080p` with `until_score 60`.

### Efficient-4K (compact UHD)
- Ordering: `WEBDL-2160p` > `WEBRip-2160p`; UHD Bluray disabled to keep files lean. 1080p fallback disabled.
- Gates: `min_format_score 25`, `min_upgrade_format_score 45`, upgrade until `WEBDL-2160p` with `until_score 70`.

### HighQuality-4K (premium UHD)
- Ordering: `Bluray-2160p` top > `WEBDL-2160p` > `WEBRip-2160p`; 1080p fallbacks disabled.
- Gates: `min_format_score 40`, `min_upgrade_format_score 65`, upgrade until `Bluray-2160p` with `until_score 90`.

## Custom Format (CF) scoring philosophy
- Core boosts: 10-bit, HEVC, HDR/DV (bigger for 4K), Proper/Repack, good audio (TrueHD/Atmos > DD+/DTS-HD > plain DD+).
- Penalties: SDR on UHD (-40), x264 (-25/-30 for 4K tracks), LQ tags, and remux tiers (-1000) as a safety net.
- Trusted groups: Hallowed/FLUX/FraMeSToR receive mild boosts; Efficient-4K gets a smaller Hallowed bump to stay efficiency-first.
- Remux is doubly discouraged: blocked by size and CF -1000, matching Trash guidance and keeping broker logic consistent.

## How upgrades behave (auto + manual)
- **Quality ordering + CF gates**: WEBDL outranks WEBRip, and (for HQ 4K) Bluray outranks WEB. Upgrades only fire when both the target quality tier and the CF score gates are met.
- **Broker alignment**: Broker only assigns to `HD`, `Efficient-4K`, or `HighQuality-4K`; `AutoAssignQuality` is intake. Manual upgrades respect the same ordering/gates, preventing noisy sidegrades.

## Release-group considerations (Usenet/Trash context)
- Preferred signals: Proper/Repack, 10-bit HEVC, HDR/DV, good audio muxes. These correlate with reputable WEB groups and curated UHD encodes.
- Avoided signals: Remux (blocked), LQ tags, SDR UHD, and oversized/undersized files that fall outside the MB/min bounds.
- Mild group boosts mirror Trash’s trusted scene/UHD teams (Hallowed/FLUX/FraMeSToR) without overwhelming technical signals.
