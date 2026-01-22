# Opinionated Radarr Quality Profile

How the **Quality Profile** + **Quality Broker** work together from an end‑user perspective, focused on configuration, behavior, and outcomes.

For setup steps and sync instructions, see the [Service Setup Guide → Automation (Recyclarr + Quality Broker)](./service-setup-guide.md#automation-recyclarr--quality-broker).

## What you get
- A consistent set of profiles: `AutoAssignQuality` → `HD` / `Efficient-4K` / `HighQuality-4K`
- A deterministic broker that assigns profiles without LLM in most cases
- Small, readable Radarr tags for decision traceability
- A safety guard that prevents accidental downgrade of existing 2160p files (tagged `exceed`)

## How it works (simple mental model)
1) **Intake**: everything starts in `AutoAssignQuality`.
2) **Decision**: the broker uses critic score, popularity, and visual-genre signals to choose a profile.
3) **Apply**: the profile is set and small tags are attached.
4) **Protection**: if the broker would drop a 2160p file into `HD`, it blocks the downgrade and tags `exceed`.

## What you configure (high level)
You only need to set a few things in `data/quality-broker/config/config.yaml`:
- **Thresholds**: critic and popularity cutoffs that drive the deterministic rules
- **Visual genres**: the genres that imply visual payoff (weights are fixed)
- **LLM fallback**: optional, used only for ambiguous cases
- **Downgrade guard**: controls whether a 2160p file can be moved to `HD`

### Visual genre weighting (fixed)
These weights shape “visual richness.” More weight = higher chance of 4K.
- Action = 3  
- War = 3  
- Animation = 2  
- Sci‑Fi = 2  
- Fantasy = 2  
- Adventure = 1  
- Thriller = 1  

## Profile intent (what each means)
- **AutoAssignQuality**: intake/holding only; nothing “final” stays here.
- **HD**: solid 1080p for low‑signal or low‑score titles.
- **Efficient-4K**: 4K‑worthy, but size‑conscious.
- **HighQuality-4K**: top‑tier critical reception and/or strong visual payoff.

## Tags you’ll see in Radarr
Tags are short on purpose (for UI clarity); they represent the rule that was applied:
- `crit` strong critic signal
- `pop` strong popularity signal
- `vis` visually rich signal
- `weak` limited/low signal
- `mix` mixed signals
- `lowq` current file is 720p or below
- `exceed` current file exceeds HD (2160p); downgrade was blocked

## The downgrade guard (“exceed”)
Default: **downgrades are blocked** if the file is already 2160p.
- If the broker decides **HD** but the file is **2160p**, it tags `exceed` and **keeps you at 4K**.
- This prevents repeated reprocessing of the same item in `AutoAssignQuality`.

If you explicitly want downgrades, set `downgradeQualityProfile: true` (dangerous).

## Units and conversions (quality definitions)
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

## Profile ordering & upgrade behavior
- **HD**: `WEBDL-1080p` > `WEBRip-1080p` > `Bluray-1080p`
- **Efficient-4K**: `WEBDL-2160p` > `WEBRip-2160p`
- **HighQuality-4K**: `Bluray-2160p` > `WEBDL-2160p` > `WEBRip-2160p`

Upgrades only fire when both the quality order and format-score gates are met. This prevents noisy side‑grades.

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
