---
name: release-scout
description: Scout Radarr releases for a movie, rank by quality against TRaSH/profile logic, optionally push the best NZB to SABnzbd. Usage: /release-scout <title> [year]
allowed-tools: Bash, Read
---

# Release Scout

Given a movie title (and optional year), fetch all available releases from Radarr's indexers, score them against our TRaSH/profile logic, present a ranked table, and push the confirmed pick to SABnzbd.

---

## Execution Steps

### 1. Load credentials

```bash
source .env 2>/dev/null
# Available after source: $RADARR_API_KEY, $SABNZBD_API_KEY
# qBittorrent has no API key — all grabs (usenet and torrent) go through Radarr's
# POST /api/v3/release endpoint. Verify via GET /api/v3/queue (covers both protocols).
```

### 2. Find movie in Radarr

```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/movie" | \
  python3 -c "
import json, sys
for m in json.load(sys.stdin):
    if '<TITLE>' in m.get('title','').lower():
        orig = m.get('originalLanguage', {}).get('name', 'English')
        print(m['id'], m['title'], m['year'],
              'profile=' + str(m['qualityProfileId']),
              'hasFile=' + str(m['hasFile']),
              'runtime=' + str(m.get('runtime','?')) + 'min',
              'originalLang=' + orig)
"
```

**Capture `originalLanguage` — it governs the MULTI/language filter logic below.**

If not in library yet: `GET /api/v3/movie/lookup?term=<title>+<year>` to get tmdbId, then `POST /api/v3/movie` to add it.

### 3. Fetch all releases (triggers indexer search)

```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/release?movieId=<ID>" | \
  python3 -c "
import json, sys
rs = json.load(sys.stdin)
out = []
for r in rs:
    out.append({
        'title':       r['title'],
        'quality':     r['quality']['quality']['name'],
        'size_gb':     round(r['size'] / 1e9, 2),
        'protocol':    r['protocol'],
        'languages':   [l['name'] for l in r.get('languages', [])],
        'cfs':         [c['name'] for c in r.get('customFormats', [])],
        'cf_score':    r.get('customFormatScore', 0),
        'rejected':    r.get('rejected'),
        'rejections':  r.get('rejections'),
        'downloadUrl': r.get('downloadUrl'),
    })
out.sort(key=lambda x: x['cf_score'] or 0, reverse=True)
print(json.dumps(out, indent=2))
"
```

### 4. Hard filters (drop before ranking)

| Condition | Action |
|---|---|
| **Quality tier downgrade** — candidate resolution tier is lower than existing file | **Drop** — never downgrade tier regardless of CF score or repute (see note below) |
| `SDR` CF present and HDR alternative exists | Drop |
| `LQ` CF present | Drop |
| quality is `TELESYNC`, `CAM`, `HDTV-*`, `WEBDL-480p`, `WEBDL-720p` | Drop |
| `Remux-*` quality | Hold — see Remux policy below; not auto-dropped |
| MB/min below quality minimum (see size table) | Drop — mislabeled or corrupt |
| Torrent with `seeders < 4` | Drop — effectively dead; flag as `low seeds (<4)` |
| **English-original film:** release language is not English and an English alternative exists | Drop |
| **English-original film:** release carries a multi-language tag (e.g. MULTI, VFQ, TRUEFRENCH, NORDIC) and an English-only alternative exists | Keep but rank below English-only (see MULTI tiebreaker) |
| **Non-English-original film:** dub-only — no original language audio track present (e.g. a French original released with English-only or German-only audio) | Drop — wrong language regardless of quality or repute |
| **Non-English-original film:** includes original language track — whether original-only, or MULTI (original + any other language) | Keep — all preferred over any dub-only release |

**Quality tier downgrade rule:** Resolution tier is a hard ceiling — a low-quality 2160p (YTS, LQ, SDR, AAC) is still preferable to the best 1080p release, because the upgrade path ends at the existing tier. Tiers in descending order: `2160p > 1080p > 720p`. If the existing file is any 2160p quality (Bluray-2160p, WEBDL-2160p, WEBRip-2160p, Remux-2160p — including YTS), drop all 1080p and lower candidates entirely. Radarr will also reject them, but filter them before ranking so they don't appear in output as false candidates.

### Upgrade priority

When scouting for YTS/LQ replacements, assess urgency before grabbing. Apply in order:

| Priority | Condition | Action |
|---|---|---|
| **P1 — Grab now** | Exceptional title (pop-culture meme, see Remux policy) + usenet available | Auto-grab or Remux confirm |
| **P1 — Grab now** | Current file is **WEBRip** (any quality) and a WEB-DL alternative exists — regardless of critic score | Always replace — WEBRip is a re-encode from stream; WEB-DL is a direct lossless download |
| **P1 — Grab now** | Audio is AAC **stereo/2.0** (actual surround downmix) + RT ≥ 90 + usenet available | Always replace — real downgrade |
| **P2 — Grab when quota allows** | Audio is AAC 5.1 + SDR + undersized (< 8 GB 2160p) — tolerable alone, but combined signals a poor overall encode | Queue |
| **P2 — Grab when quota allows** | SDR on a title where HDR is available and meaningful (action, sci-fi, vivid colour grading) | Queue for next batch |
| **P2 — Grab when quota allows** | File is grotesquely undersized (< 8 GB for 2160p, < 3 GB for 1080p) | Queue |
| **P3 — Defer** | B&W film with decent YTS size (B&W encodes efficiently; quality gap is smaller) | Not urgent |
| **P3 — Defer** | YTS file is 1080p on HD profile and size is reasonable | Acceptable; skip unless quota is free |
| **Skip** | Score < 2500 (no tiered usenet release exists yet) | Wait for better release |
| **Skip** | Foreign-language original: proper-language releases exist but all fail other filters (size cap, Remux policy, score threshold) | Keep YTS; note in DROPPED what blocked each release and what to wait for |
| **Skip** | Foreign-language original: no release with original language track exists at all (only non-original dubs available) | Keep YTS — hard filter already drops dub-only releases; nothing actionable |

**Foreign-language Skip — what "proper-language" means:** A release that includes the original language audio track, either as the only track or as part of a MULTI (original+EN) release. Any release without the original language audio track is already hard-filtered out regardless of which dub language it carries (English, German, or any other). "No alternative" means either: (a) zero releases with original language exist on any indexer, or (b) proper-language releases exist but are all blocked by other hard filters — Remux not in profile, over size cap, or below score threshold. In case (b), list each blocked release in DROPPED with the specific blocker (e.g. `FraMeSToR Remux-2160p [High, IT]: Remux not in profile — wait for tiered Bluray-2160p IT+EN encode`), so the user knows what to watch for.

**Disk quota rule:** Each swap costs 3–5× the YTS file size. Confirm with user when total queued batch exceeds ~100 GB.

### Remux policy

Remux files are 40–80 GB for a 4K title and our CF score penalises them (-1000) by default. The single gate is whether the title is **exceptional**.

**Exceptional title → Remux preferred, overrides any WEB decision.**

A title is exceptional if it is **widely known beyond cinephile circles** — a non-film-buff would recognise it. Two tiers both qualify:

**Tier A — Pop-culture meme titles:** Live-action films with mass cultural penetration, referenced in internet/mainstream culture, where audiovisual spectacle is central to re-watch appeal.
- Examples: *The Dark Knight*, *Joker*, *Mad Max: Fury Road*, *Blade Runner 2049*, *Interstellar*, *Dunkirk*, *Apocalypse Now*, *2001: A Space Odyssey*
- **Genre cap:** Animation, Documentary, and Musical titles are capped at Tier B regardless of pop-culture penetration. Even universally known titles like *The Lion King*, *Shrek*, *Toy Story*, *Fantasia*, or *Woodstock* do not reach Tier A — the audiovisual spectacle argument applies less strongly and lossless vs. compressed differences are less perceptible in these formats.

**Tier B — Cultural landmarks:** Universally known by general educated audiences — not meme-level, but any non-enthusiast has heard of them. Often historically significant or widely taught. Maximum tier for Animation, Documentary, and Musical regardless of cultural impact.
- Examples: *Schindler's List*, *Lawrence of Arabia*, *The Godfather*, *Casablanca*, *Apocalypse Now*, *The Lion King* (Animation), *Ghost in the Shell* (Animation)

**Not exceptional — cinephile/expert-only titles:** Require film education to know or appreciate. Niche Criterion catalogue, festival circuit, or regional classics.
- Examples: *Rashomon*, *Ikiru*, *Stalker*, *A Brighter Summer Day*, *Jeanne Dielman*

The test: *"Would a non-film-buff recognise this title?"* Yes → exceptional. No → not exceptional. Routine blockbusters and streaming originals do not qualify regardless.

**Sequels and franchise entries:** Only the culturally defining entry qualifies, not the whole franchise. *Avatar* (2009) redefined 3D cinema and is a cultural landmark — Tier A. *Avatar: The Way of Water* (2022) is a well-made sequel with great visuals but does not carry the same cultural weight independently — not exceptional, no Remux. Apply the same logic to any series: the entry that *defined* the franchise or moment qualifies; follow-ups generally do not unless they independently achieved landmark status (e.g. *The Dark Knight* qualifies on its own merits, not just as "the Batman sequel").

**Not exceptional → Remux dropped.** Do not surface it in candidates or held — omit it entirely and note in DROPPED.

**Profile does not override exceptional status.** If the current profile blocks Remux (e.g. HighQuality-4K ceiling is Bluray-2160p, or Remux-2160p is not in the wanted quality list), do not silently accept the profile as the final word for an exceptional title. Explicitly recommend a profile change that would allow Remux, and surface the Remux as the preferred pick with the blocker noted. The profile is a configuration — it can and should be adjusted for titles that genuinely warrant lossless quality. This aligns with the general rule to re-evaluate the profile rather than trust it blindly.

**Confirmation:** Never push a Remux automatically. Present it as rank 1 (if exceptional) with size, group, and the reasoning, and wait for explicit user confirmation before calling the SABnzbd API.

**In the ranked output (exceptional title):** Remux appears inline as rank 1 with a note:

```
RANK  SCORE  QUAL            SIZE    LANG   REPUTE   PROTO    SOURCE/GROUP        FLAGS
   1   —     Remux-2160p    47.2GB  EN     High     usenet   FraMeSToR           TrueHD 7.1 Atmos, HDR10 — exceptional title, Remux preferred; confirm before push
         → Title.2024.UHD.BluRay.REMUX.HDR.TrueHD.7.1.Atmos-FraMeSToR
   2  +4500  WEBDL-2160p    23.8GB  EN     High     usenet   FLUX (MA)           shown for reference
```

Score is shown as `—` for Remux since the CF score (-1000) is a policy signal, not a quality signal, and should not affect rank when exceptional status applies.

**When a title is exceptional or approaching exceptional but Remux is excluded**, always surface a named `⚠ Remux excluded` line at the top of DROPPED — never bury it silently. State the specific blocker so the user understands what would need to change:

```
DROPPED:
  ⚠ Remux excluded — FraMeSToR Remux-2160p [High, 93GB]: Remux-2160p not in profile (HighQuality-4K ceiling is Bluray-2160p) — title qualifies as Tier B exceptional; would require a profile that includes Remux in wanted qualities
  ⚠ Remux excluded — FraMeSToR Remux-2160p [High, 93GB]: profile size cap set to 129MB for Remux (effectively blocked regardless of quality)
```

Use `⚠ Remux excluded` (not just a generic dropped line) whenever the title's exceptional status makes Remux the theoretically correct pick but a hard constraint prevents it. This makes the gap visible for future profile decisions.

---

### 5. Score and rank

**Quality tier baseline:**

| Quality | Base |
|---|---|
| WEBDL-2160p | 100 |
| Bluray-2160p | 90 |
| WEBRip-2160p | 75 |
| WEBDL-1080p | 70 |
| Bluray-1080p | 65 |
| WEBRip-1080p | 55 |

**Add-ons:**

| Signal | Points |
|---|---|
| ATVP source | +25 |
| AMZN / NF / DSNP / HMAX source | +18 |
| iT (iTunes) source | +10 |
| Dolby Vision (`DV` or `DV Boost` CF) | +25 |
| HDR10+ Boost CF | +20 |
| HDR CF | +10 |
| DD+ / DDP / EAC3 audio | +8 |
| DTS-HD MA | 0 — no bonus; deprioritised (Google TV requires transcode; Sonos passthrough unsupported) |
| Scene CF (verified group) | +5 |
| usenet protocol | +10 |

**Repute — evaluate in this order: CF tier → source provenance → group name knowledge**

Assign one of four labels: **High / Medium / Low / Unknown**

#### Step 1 — Check CFs for a TRaSH-detected tier (authoritative, no guessing)

TRaSH tier custom formats are synced by Recyclarr and appear directly in the API `customFormats` array. If present, they are the most reliable signal available — use them first.

| CF detected | Repute | Examples seen in API |
|---|---|---|
| `WEB Tier 01` / `WEB Tier 02` / `WEB Tier 03` | **High** | CMRG, FLUX, NTb, playWEB, TOMMY |
| `HD Bluray Tier 01` / `02` / `03` | **High** | hallowed, BHDStudio, EDPH |
| `UHD Bluray Tier 01` / `02` / `03` | **High** | W4NK3R, SPHD |
| `Remux Tier 01` / `02` / `03` | **High** (Remux held pending landmark check — see Remux policy) | FraMeSToR, CiNEPHiLES |
| `LQ` or `LQ (Release Title)` | **Low** — drop | BTM, -E groups |

If a tier CF is present, set Repute from the table above and skip Steps 2–3.

#### Step 2 — Check CFs for a verified paid source (if no tier CF)

Verified paid sources (AMZN, NF, ATVP, iT, DSNP, HMAX, MA) require a financial transaction. There is a meaningful barrier to mislabeling: the encode pipeline starts from an authenticated stream. A Medium group releasing an iTunes or DSNP rip is often more reliable than a High group releasing an untagged WEB.

| Group tier | + Verified paid source CF | Repute |
|---|---|---|
| High | any | **High** |
| Medium | AMZN, NF, ATVP, iT, DSNP, HMAX, MA | **High** |
| Unknown | AMZN, NF, ATVP, iT, DSNP, HMAX, MA | **Medium** |
| Low | any | **Low** — source cannot lift a Low group |
| Any | untagged WEB / WEBRip | fall through to Step 3 |

#### Step 3 — Fall back to group name knowledge (untagged sources only)

Only reach here when no tier CF and no verified source CF. Use knowledge of the usenet/P2P scene.

| Group tier | Repute |
|---|---|
| High (known TRaSH-aligned group releasing without a service tag) | **High** |
| Medium (reliable but untiered group, untagged source) | **Medium** |
| Low / flagged | **Low** |
| Unrecognised | **Unknown** — flag explicitly in output |

**Group name reference (for Steps 2–3):**

| Tier | Known groups |
|---|---|
| High | FLUX, NTb, CMRG, playWEB, TOMMY, SMURF, MZABI, YELL, TEPES, ETHEL, GGWP, GNOME, BHDStudio, hallowed, W4NK3R, SPHD, FraMeSToR, CiNEPHiLES |
| Medium | KyoGo, NeoNoir, TORK, QHstudIo, MgB, PiRaTeS, MrTentsaw, BANDOLEROS, SPARKS, FTW, Slay3R, Tigole, MkvCage |
| Low | BTM, -E suffix groups, PSA, YIFY (SD/720p), KINGDOM, AOC, LAMA, UnKn0wn, Musafirboy |
| Unknown | CM, DVSUX, Asiimov, HDS, BeiTai, SHB931 — and any group not listed above |

**Key examples from practice:**

| Release | Group | Source | Repute | Reasoning |
|---|---|---|---|---|
| `Avatar.2022.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR10.H.265-CMRG` | CMRG | MA (Movies Anywhere) | **High** | WEB Tier 01 group + Movies Anywhere = authenticated Disney/studio source |
| `Avatar.2022.1080p.MA.WEB-DL.DDP5.1.Atmos.H.264-FLUX` | FLUX | MA | **High** | WEB Tier 01 + MA — gold standard for 1080p |
| `Avatar.2022.BluRay.1080p.DDP.5.1.x264-hallowed` | hallowed | Bluray | **High** | HD Bluray Tier 03; consistent physical media rips |
| `Avatar.2022.2160p.DSNP.WEB-DL.DDPA.5.1.DV.HDR.H.265-PiRaTeS` | PiRaTeS | DSNP | **High** | Medium group elevated by verified Disney+ source — paid service, authenticated stream |
| `Avatar.2022.2160p.iTunes.WEB-DL.HDR10+.DD5.1-QHstudIo` | QHstudIo | iTunes | **High** | Medium group elevated by iTunes — Apple's pipeline; financial barrier to mislabel |
| `Shelter.2026.Siginak.AMZN.WEB-DL.1080p.H.264.DD5.1.E.AC3.ENG.TORK` | TORK | AMZN | **High** | Medium group elevated by AMZN tag — Amazon Prime authenticated rip |
| `Avatar.2022.AMZN.4K.WEBRip.2160p.DoVi.HDR10+.DD+.x265-MgB` | MgB | AMZN | **High** | Medium group + AMZN = verified paid source overrides group tier |
| `Avatar.2022.UHD.4K.BluRay.2160p.HDR10.TrueHD.7.1.Atmos.H.265-MgB` | MgB | Bluray | **Medium** | Same group, but Bluray source has no service authentication; group alone is Medium |
| `Avatar.2022.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.MKV.x265-CM` | CM | MA | **Medium** | MA source is verified; CM is Unknown group — source elevates to Medium but can't reach High without group history |
| `Shelter.2026.HDR.2160p.WEB.h265-ETHEL` | ETHEL | untagged WEB | **High** | High group (Scene/TRaSH) — group reputation holds even without service tag |
| `Avatar.2022.NORDIC.REPACK.1080p.WEB-DL.H.264.DDP5.1.Atmos-BANDOLEROS` | BANDOLEROS | untagged WEB | **Medium** | Known Nordic scene group, untiered; REPACK flag = prior issue fixed, acceptable |
| `Avatar.2022.2160p.WEB-DL.DDP5.1.Atmos.DV.MKV.x265-DVSUX` | DVSUX | untagged WEB | **Unknown** | Name unknown; no TRaSH listing; no verified source tag — flag explicitly |
| `Avatar.2022.UHD.BluRay.REMUX.HDR.TrueHD.7.1.Atmos-UnKn0wn` | UnKn0wn | Bluray Remux | **Low** | Self-named "unknown" = no credibility signal; chronic pattern with mislabeled Remux releases |
| `Avatar.2022.IMAX.DS4K.1080p.MA.WEBRip.x265-Musafirboy` | Musafirboy | MA | **Low** | Known re-encoder; history of quality issues and inconsistent output; MA source doesn't save Low group |

Score bonus: Repute High → +30, Medium → +10, Low → drop, Unknown → 0 (flagged in output).

**Size sanity check (MB/min against runtime):**

| Quality | Min | Max |
|---|---|---|
| WEBDL-1080p | 12 | 80 |
| WEBDL-2160p | 25 | 170 |
| WEBRip-1080p | 8 | 45 |
| WEBRip-2160p | 20 | 110 |

- **Below minimum → DROP.** A 2160p file at 7MB/min is not a 2160p file. Move to DROPPED with reason `undersized for quality: X MB/m < Y min`.
- **Above maximum → DROP.** Already handled by size cap filter above.
- Only files within range proceed to ranking.

**Tiebreaker and preference rules (apply in order):**

1. **Dolby Vision wins close contests — except in Remux from non-High repute groups.** When two releases are within ~300 score points, prefer the one with DV (`DV` or `DV Boost` CF present). DV is a meaningful display-layer upgrade that score arithmetic undersells. If the score gap is large (>300), score wins regardless of DV.

   **Remux DV caveat:** Do not apply this preference when the DV release is a Remux from a Medium, Unknown, or Low repute group. DV layers in Remux from non-TRaSH-tiered groups have an elevated risk of being injected, mismatched, or inconsistently mastered. Only trust DV in Remux when the group's repute is High (i.e. confirmed by a `Remux Tier 01/02/03` CF or strong group history). For High-repute Remux, DV remains a valid differentiator.

2. **`-AsRequested` preferred on tied releases.** When two releases have identical or near-identical scores and the same base name (same group, same quality, essentially the same file posted twice or under variant names), prefer the one suffixed `-AsRequested`. It indicates the NZB was assembled to exactly match the profile request rather than a generic bulk post, which means better completeness and fewer segment gaps.

3. **WEB-DL always beats WEBRip at the same resolution tier.** WEBRip is a re-encode from a streamed source; WEB-DL is a direct lossless download. At equal resolution (e.g. both WEBDL-2160p vs WEBRip-2160p), WEB-DL wins unconditionally regardless of score gap, repute, or critic rating. Score arithmetic already reflects this (baseline gap of 25 points) but the preference is absolute — never rank a WEBRip above a WEB-DL of the same resolution.

4. **Ambiguous/borderline critic score → prefer WEBDL.** If a movie's critical reception is uncertain (newly released, mixed reviews, RT/Metacritic split, or no reliable rating yet), lean toward WEBDL over Bluray or WEBRip. A streaming encode from an authenticated paid source is more consistent than a Bluray rip of unverified quality.

5. **WEBDL over Bluray when Bluray group repute is Unknown or Low.** An authenticated WEBDL from AMZN/NF/ATVP/DSNP (even from a Medium group) is more reliable than a Bluray from an untiered or unknown group. The financial barrier of a streaming transaction provides a quality floor that physical disc rips from unrecognised encoders do not.

6. **Atmos audio breaks ties when quality is ambiguous.** When two releases are close in score and repute (e.g. WEB Tier 1 without Atmos vs WEB Tier 3 with Atmos, or AMZN vs DSNP at similar score), prefer the release with Dolby Atmos (`TrueHD Atmos`, `DD+ Atmos`, `DDPA`, `Atmos` CF). Atmos is a meaningful audio upgrade that scoring doesn't fully capture.

7. **DD+/EAC3 preferred over DTS-HD MA in close contests.** When two releases are within ~200 score points and otherwise equivalent, prefer the one with DD+/EAC3 audio over DTS-HD MA. DTS-HD MA requires Jellyfin to transcode on Google TV clients and is not passthrough-compatible with Sonos; DD+/EAC3 streams natively. This is not a hard drop — a substantially better release (higher tier, superior video) with DTS-HD MA should still win. Always flag DTS-HD MA releases in FLAGS with `⚠ DTS-HD MA (transcode req.)`.

8. **Original-language-only preferred over MULTI when scores are close (English-original films).** When two releases are within ~200 score points and otherwise equivalent, prefer the English-only release over one carrying a multi-language tag (e.g. MULTI, VFQ, TRUEFRENCH, NORDIC). Extra language tracks add size and complexity without benefit for English-original content. If the MULTI release is the only good option, keep it but note it in FLAGS.

   **Inverted for non-English-original films:** The original language track is required. Acceptable picks in order of preference: MULTI (original + any other language) → original-only → original + alternate. Any dub-only release (no original language track) is dropped regardless of quality or repute, as per the hard filter. State the film's original language prominently in the scout header (e.g. `Lang: Italian`, `Lang: French`).

9. **Verified group > unknown** (within the same protocol and score band).

10. **Usenet strongly preferred; torrent is last resort — warn before grabbing.**
    - Never pick a torrent when a comparable usenet release exists. "Comparable" means same resolution tier and repute within one step (e.g. usenet Medium vs torrent High is not comparable enough to justify torrent).
    - Only fall back to torrent when: (a) no usenet release passes all filters, OR (b) the torrent is meaningfully superior and no usenet equivalent will plausibly appear (e.g. a TRaSH Tier 01 torrent where the title has no usenet indexer coverage at all).
    - **Mandatory warning when only torrents are available:** Before grabbing, surface a prominent warning in the output:
      ```
      ⚠ TORRENT ONLY — no usenet release passed filters for this title.
        Torrent grab goes to qBittorrent (not SABnzbd). Confirm to proceed.
      ```
    - State `torrent only — last resort` in FLAGS for every torrent entry when no usenet alternative exists.
    - If both usenet and torrent candidates exist, never rank a torrent above a usenet release of the same or comparable quality tier.

11. **Discard torrents with fewer than 4 seeds.** A torrent with <4 seeds is effectively dead. Drop it regardless of repute or quality — flag in DROPPED as `low seeds (<4)`.

### 6. Profile assessment

```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/qualityprofile" | \
  python3 -c "import json,sys; [print(f'id={p[\"id\"]:2} {p[\"name\"]:20} min_score={p.get(\"minFormatScore\",0):5} upgrades={p.get(\"upgradeAllowed\")}') for p in json.load(sys.stdin)]"
```

**Re-evaluate the profile — do not take the current assignment for granted.**

Before accepting the current profile as correct, assess whether it fits the title. Ask:

1. **Does the profile's upgrade target exist for this title?** If the profile targets WEBDL-2160p (Efficient-4K) but no streaming service has released a 4K version (common for pre-2000 films, niche releases), the upgrade target will never appear. Radarr will spin forever and reject perfectly good Bluray-2160p options. → Switch to `HighQuality-4K` or `DontUpgrade`.

2. **Is the title acclaimed enough to deserve a higher-quality profile?** A film with strong critical reception (e.g. RT ≥ 85, Metacritic ≥ 75, or a known critics' favourite even without mass cultural penetration) warrants a higher-quality target than a generic blockbuster. If it's on `Efficient-4K` but a Bluray-2160p from a tiered group exists, switching to `HighQuality-4K` gets you a better encode. If it approaches Tier B exceptional status, consider whether Remux is justified.

3. **Is the title on an over-ambitious profile relative to what's actually available?** A 1960s black-and-white film assigned to `HighQuality-4K` will rarely have a 4K release at all — `HD` may be the right ceiling.

State the profile assessment prominently at the top of the scout output, especially when the current profile is mismatched or when a change would unlock a better grab.

**Profile change guidance:**

| Situation | Action |
|---|---|
| All releases rejected due to `min_format_score: 2500`, no TRaSH-tiered group released yet | After manual push, switch to `DontUpgrade` (id=13) to stop Radarr spinning |
| Profile targets WEBDL-2160p but no streaming 4K release exists for this title (e.g. pre-2000 or niche film) | Switch to `HighQuality-4K` (id=10) to allow Bluray-2160p, or `DontUpgrade` if no good Bluray-2160p exists yet |
| Title is critically acclaimed or approaching exceptional — profile is undershooting | Upgrade to `HighQuality-4K` (id=10); consider Remux if title meets exceptional threshold |
| Movie on 4K profile but only 1080p sources are quality-appropriate | Switch to `HD` (id=12) via Quality Broker reassignment |
| Movie on HD profile but good 4K is available | Switch to `Efficient-4K` (id=9) or `HighQuality-4K` (id=10) |

### 7. Present ranked output

Always output this exact table format (usenet first within each rank tier):

```
Movie: <Title> (<Year>) | Runtime: <N>min | Profile: <name> | Status: <hasFile> | Lang: <originalLang>
⚠ Non-English original (French) — English-only releases dropped; prefer MULTI or original+EN alternate  ← include this line only when originalLang ≠ English
Rejection reason (if all blocked): <reason>

RANK  SCORE  QUAL            SIZE    LANG   REPUTE   PROTO    SOURCE/GROUP        FLAGS
   1  +XXX   WEBDL-2160p    12.3GB  EN     High     usenet   ETHEL (Scene)       HDR — recommended
         → Shelter.2026.HDR.2160p.WEB.h265-ETHEL
   2  +XXX   WEBDL-2160p    14.8GB  EN     Medium   usenet   QHstudIo (iTunes)   HDR10+, unverified group
         → Shelter.2026.2160p.iTunes.WEB-DL.HEVC.10bit.HDR10+.DD5.1.2Audios-QHstudIo
   3  +XXX   WEBDL-1080p     6.7GB  EN     Medium   usenet   TORK (AMZN)         Best 1080p; switch profile to HD
         → Shelter.2026.Siginak.AMZN.WEB-DL.1080p.H.264.DD5.1.E.AC3.ENG.TORK
   4  +XXX   WEBDL-1080p     5.9GB  EN     Medium   torrent  KyoGo (AMZN)        Torrent only
         → Shelter.2026.1080p.AMZN.WEB-DL.DDP5.1.H.264-KyoGo
   5  +XXX   WEBRip-1080p    1.5GB  EN     Medium   usenet   NeoNoir             Compact re-encode; WEBRip source
         → Shelter.2026.1080p.WEBRip.10Bit.DDP.5.1.x265-NeoNoir

DROPPED (N filtered):
  - Slay3R 4K [Medium]: French only (MULTi/VFQ), English alternative available
  - ETHEL 4K SDR [High]: SDR — HDR alternative exists
  - BTM 4K [Low]: LQ group flagged by TRaSH
  - 3× TELESYNC: quality tier blocked
```

Include a 1-line reasoning note per ranked entry. Always show the full release filename on the indented line below each rank. For dropped entries, include the group's repute label so the user understands what was discarded. List all dropped releases with reason.

### 8. Push confirmed release to SABnzbd

**Always use `POST /api/v3/release` via Radarr — never push the `downloadUrl` directly to SABnzbd.**

The `downloadUrl` from Radarr's release search is a Prowlarr link with a time-limited signed token. It expires within minutes. If you push it directly to SABnzbd's `addurl`, SABnzbd will try to fetch it later and get a 403/404, then loop on "Grabbing / wait and retry".

The correct flow: pass the release `guid` (and `indexerId`) back to Radarr via `POST /api/v3/release`. Radarr re-fetches the NZB from Prowlarr using its own live credentials and pushes it directly to the configured download client (SABnzbd). No URL expiry issues.

Wait for user to confirm which rank to grab, then:

```bash
source .env 2>/dev/null

# guid and indexerId come from the release JSON fetched in step 3
GUID="<release guid>"
INDEXER_ID="<release indexerId>"

curl -s -X POST \
  -H "X-Api-Key: $RADARR_API_KEY" \
  -H "Content-Type: application/json" \
  "http://localhost:3273/api/v3/release" \
  -d "{\"guid\": \"${GUID}\", \"indexerId\": ${INDEXER_ID}}" | \
  python3 -c "
import json, sys
r = json.load(sys.stdin)
print('✓ Radarr grabbed release — title:', r.get('title','?'))
"
```

Verify it landed — use Radarr queue (covers both usenet and torrent):
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/queue" | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Radarr queue: {d[\"totalRecords\"]} records')
for r in d.get('records', [])[:8]:
    print(f'  [{r[\"status\"]}] {r[\"title\"][:60]} — {r[\"protocol\"]} — {round(r.get(\"size\",0)/1e9,1)}GB')
"
```

Optional — SABnzbd-only detail (usenet slots):
```bash
curl -s "http://localhost:3274/api?mode=queue&output=json&apikey=${SABNZBD_API_KEY}" | \
  python3 -c "
import json, sys
q = json.load(sys.stdin)['queue']
print(f'SABnzbd: {q[\"noofslots\"]} slots, {q[\"mbleft\"]}MB remaining, speed: {q[\"speed\"]}')
for s in q.get('slots', [])[:5]:
    print(f'  {s[\"status\"]:12} {s[\"filename\"]}')
"
```

### 9. Optional: update Radarr profile

```bash
source .env 2>/dev/null
MOVIE_ID=<ID>
NEW_PROFILE_ID=<ID>   # e.g. 13 = DontUpgrade

# Fetch full movie object, patch profileId, PUT it back
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/movie/${MOVIE_ID}" | \
  python3 -c "
import json, sys
m = json.load(sys.stdin)
m['qualityProfileId'] = ${NEW_PROFILE_ID}
print(json.dumps(m))
" | \
curl -s -X PUT -H "X-Api-Key: $RADARR_API_KEY" \
  -H "Content-Type: application/json" \
  "http://localhost:3273/api/v3/movie/${MOVIE_ID}" \
  -d @- | \
  python3 -c "import json,sys; m=json.load(sys.stdin); print('Profile updated:', m.get('qualityProfileId'))"
```

---

## Worked Example — Avatar: The Way of Water (2022)

Efficient-4K profile, 192min runtime, file already present (upgrade scouting).
435 releases found → 154 hard-filtered → 62 candidates → ranked below.

```
Movie: Avatar: The Way of Water (2022) | Runtime: 192min | Profile: Efficient-4K | Status: has file
All rejected: existing file already at Efficient-4K quality

RANK  SCORE  QUAL            SIZE    LANG   REPUTE   PROTO    SOURCE/GROUP              FLAGS
   1  +4500  WEBDL-2160p    23.8GB  EN     High     usenet   PiRaTeS (DSNP)            DV+HDR10, 124MB/m ✓ — Medium group lifted by Disney+ verified source
         → Avatar.The.Way.of.Water.2022.2160p.DSNP.WEB-DL.DDPA.5.1.DV.HDR.H.265-PiRaTeS
   2  +6220  WEBDL-1080p    13.8GB  EN     High     usenet   FLUX (MA, WEB Tier 01)    DD+Atmos, 72MB/m ✓ — gold standard 1080p; below Efficient-4K target
         → Avatar.The.Way.of.Water.2022.1080p.MA.WEB-DL.DDP5.1.Atmos.H.264-FLUX
   3  +6200  WEBDL-1080p    15.1GB  EN     High     torrent  CMRG (WEB Tier 01)        DD+Atmos, 79MB/m ✓ — Tier 01; no service tag; torrent only
         → Avatar.The.Way.of.Water.2022.1080p.WEB-DL.DDP5.1.Atmos.H.264-CMRG
   4  +4000  Bluray-2160p   18.1GB  EN     Medium   usenet   MgB (Bluray)              TrueHD Atmos 7.1, HDR10, 94MB/m ✓ — physical disc source, no streaming auth
         → Avatar.The.Way.Of.Water.2022.UHD.4K.BluRay.2160p.HDR10.TrueHD.7.1.Atmos.H.265-MgB
   5  +3000  WEBDL-1080p     9.4GB  EN     Medium   usenet   PiRaTeS (MAX)             DD+Atmos, 49MB/m ✓ — MAX source unscored by CF but streaming-authenticated
         → Avatar.The.Way.of.Water.2022.1080p.MAX.WEB-DL.DDPA.5.1.H.265-PiRaTeS
   6  +3005  WEBDL-1080p    12.8GB  EN     Medium   usenet   BANDOLEROS (WEB)          Nordic REPACK (prior issue corrected), untagged source, 67MB/m ✓
         → Avatar.The.Way.of.Water.2022.NORDiC.REPACK.1080p.WEB-DL.H.264.DDP5.1.Atmos-BANDOLEROS
   7  +1750  WEBDL-1080p    14.9GB  EN     Medium   torrent  CM (iTunes)               iT source lifts Unknown→Medium; torrent only
         → Avatar.The.Way.of.Water.2022.1080p.iT.WEB-DL.DDP7.1.x264-CM
   8  +4600  WEBRip-2160p    8.8GB  EN     Unknown  torrent  Asiimov                   DV+HDR10+, 46MB/m ✓ — no usenet, no scene history; flag
         → Avatar: The Way of Water 2022 2160p WEBRip DDP5.1 Atmos DoVi HDR10+ x265-Asiimov

DROPPED (154 filtered):
  - CMRG 4K [High]: 38.7GB, 201MB/m — over WEBDL-2160p size cap (170MB/m)
  - CMRG 1080p usenet [High]: 15.9GB, 83MB/m — marginally over WEBDL-1080p cap (80MB/m)
  - hallowed Bluray-1080p [High]: 15.5GB, 81MB/m — over Bluray-1080p cap (75MB/m)
  - FraMeSToR/CiNEPHiLES Remux [High]: 44-81GB — dropped; Avatar: The Way of Water is not an exceptional/reference title by the Remux policy standard
  - W4NK3R/SPHD/HDS Bluray-2160p [High/Unknown]: 46-62GB, 241-321MB/m — over size cap
  - CM/DVSUX WEBDL-2160p [Unknown]: 36-39GB, 188-202MB/m — over size cap
  - MgB WEBRip-2160p [Medium]: 38.2GB, 199MB/m — over WEBRip-2160p cap (110MB/m)
  - UnKn0wn Remux [Low]: self-named, mislabeled Remux pattern
  - Musafirboy WEBRip-1080p [Low]: LQ group — MA source cannot elevate Low
  - All SDR, HDTV, 720p, non-English variants
```

**Repute decisions called out:**
- PiRaTeS (Medium) + DSNP → **High**: Disney+ is a paid authenticated source; someone paid to rip it
- FLUX (High) + MA → **High**: WEB Tier 01 + Movies Anywhere = gold standard
- MgB (Medium) + Bluray → **Medium**: physical disc has no service authentication; group tier holds
- CM (Unknown) + iT → **Medium**: iTunes elevates Unknown to Medium but cannot reach High without group history
- Asiimov (Unknown) + no service tag → **Unknown**: nothing to anchor trust; flag in output
- Musafirboy (Low) + MA → **Low**: verified source cannot lift a Low group

---

## Quick Reference

**Profile IDs (this stack):**

| ID | Name | Min Score | Upgrades |
|---|---|---|---|
| 7 | AutoAssignQuality | 0 | No |
| 9 | Efficient-4K | 2500 | Yes → WEBDL-2160p |
| 10 | HighQuality-4K | 2500 | Yes → Bluray-2160p |
| 12 | HD | 2500 | Yes → Bluray-1080p |
| 13 | DontUpgrade | 0 | No |

**Key docs:**
- [docs/quality-profile.md](../../../docs/quality-profile.md) — size caps, CF scores, TRaSH deviations
- [docs/quality-broker.md](../../../docs/quality-broker.md) — how profiles are assigned
