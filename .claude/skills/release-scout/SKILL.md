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
SAB_KEY=$(grep '^api_key' data/sabnzbd/config/sabnzbd.ini | awk '{print $3}')
```

### 2. Find movie in Radarr

```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/movie" | \
  python3 -c "
import json, sys
for m in json.load(sys.stdin):
    if '<TITLE>' in m.get('title','').lower():
        print(m['id'], m['title'], m['year'],
              'profile=' + str(m['qualityProfileId']),
              'hasFile=' + str(m['hasFile']),
              'runtime=' + str(m.get('runtime','?')) + 'min')
"
```

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
| `SDR` CF present and HDR alternative exists | Drop |
| `LQ` CF present | Drop |
| quality is `TELESYNC`, `CAM`, `HDTV-*`, `WEBDL-480p`, `WEBDL-720p` | Drop |
| `Remux-*` quality | Drop (size policy + CF -1000) |
| Language is not English and English alternative exists | Drop or rank below |
| Multi-language (MULTI/VFQ/TRUEFRENCH) | Warn — keep only if no English-only alternative |

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
| HDR10+ Boost CF | +20 |
| HDR CF | +10 |
| DD+ / DDP audio | +8 |
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
| `Remux Tier 01` / `02` / `03` | **High** (but Remux is blocked by policy) | FraMeSToR, CiNEPHiLES |
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

Flag anything outside range as mislabeled or padded.

**Tiebreaker and preference rules (apply in order):**

1. **Ambiguous/borderline critic score → prefer WEBDL.** If a movie's critical reception is uncertain (newly released, mixed reviews, RT/Metacritic split, or no reliable rating yet), lean toward WEBDL over Bluray or WEBRip. A streaming encode from an authenticated paid source is more consistent than a Bluray rip of unverified quality.

2. **WEBDL over Bluray when Bluray group repute is Unknown or Low.** An authenticated WEBDL from AMZN/NF/ATVP/DSNP (even from a Medium group) is more reliable than a Bluray from an untiered or unknown group. The financial barrier of a streaming transaction provides a quality floor that physical disc rips from unrecognised encoders do not.

3. **usenet > torrent** (within the same score band).

4. **Verified group > unknown** (within the same protocol and score band).

### 6. Profile assessment

```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:3273/api/v3/qualityprofile" | \
  python3 -c "import json,sys; [print(f'id={p[\"id\"]:2} {p[\"name\"]:20} min_score={p.get(\"minFormatScore\",0):5} upgrades={p.get(\"upgradeAllowed\")}') for p in json.load(sys.stdin)]"
```

**Profile change guidance:**

| Situation | Action |
|---|---|
| All releases rejected due to `min_format_score: 2500`, no TRaSH-tiered group released yet | After manual push, switch to `DontUpgrade` (id=13) to stop Radarr spinning |
| Movie on 4K profile but only 1080p sources are quality-appropriate | Switch to `HD` (id=12) via Quality Broker reassignment |
| Movie on HD profile but good 4K is available | Switch to `Efficient-4K` (id=9) or `HighQuality-4K` (id=10) |

### 7. Present ranked output

Always output this exact table format (usenet first within each rank tier):

```
Movie: <Title> (<Year>) | Runtime: <N>min | Profile: <name> | Status: <hasFile>
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

**Network note:** Claude/bash runs on the HOST. SABnzbd runs in Docker.
- Call the SABnzbd API via `localhost:3274` (host-exposed port) ← from bash on host, this is correct
- The `downloadUrl` from Radarr already contains `host.docker.internal:3276` ← SABnzbd (in Docker) uses this to reach Prowlarr; do NOT replace it with `localhost`

Wait for user to confirm which rank to grab, then:

```bash
source .env 2>/dev/null
SAB_KEY=$(grep '^api_key' data/sabnzbd/config/sabnzbd.ini | awk '{print $3}')

# downloadUrl comes from the Radarr release JSON — already uses host.docker.internal
NZB_URL="<downloadUrl>"
NZB_NAME="<release title>"

curl -s "http://localhost:3274/sabnzbd/api" \
  --data-urlencode "mode=addurl" \
  --data-urlencode "name=${NZB_URL}" \
  --data-urlencode "nzbname=${NZB_NAME}" \
  --data-urlencode "cat=movies" \
  --data-urlencode "priority=0" \
  --data-urlencode "apikey=${SAB_KEY}" | \
  python3 -c "
import json, sys
r = json.load(sys.stdin)
if r.get('status'):
    print('✓ Queued in SABnzbd — job ID:', r.get('nzo_ids'))
else:
    print('✗ Failed:', r)
"
```

Verify it landed:
```bash
curl -s "http://localhost:3274/sabnzbd/api?mode=queue&output=json&apikey=${SAB_KEY}" | \
  python3 -c "
import json, sys
q = json.load(sys.stdin)['queue']
print(f'Queue: {q[\"noofslots\"]} slots, {q[\"mbleft\"]}MB remaining')
for s in q.get('slots', [])[:5]:
    print(f'  {s[\"status\"]:10} {s[\"filename\"]}')
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
  - FraMeSToR/CiNEPHiLES Remux [High]: 44-81GB — Remux blocked by policy
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
