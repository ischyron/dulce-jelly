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

**Repute — composite of group reputation AND source provenance:**

Assign one of four labels: **High / Medium / Low / Unknown**

Repute is not group-only. Source provenance is an independent reliability signal:
- **Verified paid sources** (AMZN, NF, ATVP, iT, DSNP, HMAX) require a financial transaction to obtain. There is a meaningful barrier to mislabeling or fabricating the rip, and the encode pipeline starts from an authenticated stream. A Medium group releasing an iTunes or AMZN rip is often *more* reliable in practice than a High group releasing an untagged WEB.
- **Untagged WEB** means the source is unknown — could be any streaming platform, re-encode, or private capture. Even a High group can only be trusted as far as their process; the underlying source is unverifiable.

**Combined rubric:**

| Repute | When to assign |
|---|---|
| **High** | High group + any source, OR Medium/Unknown group + verified paid source (AMZN, NF, ATVP, iT, DSNP, HMAX) |
| **Medium** | Medium group + untagged WEB or WEBRip, OR Unknown group + verified paid source |
| **Low** | Low group regardless of source; OR any group with LQ CF flag |
| **Unknown** | Unrecognised group + no verified source tag — flag explicitly, do not rank above Medium releases |

**Group tiers (feed into the rubric above):**

| Tier | Examples |
|---|---|
| High | FLUX, NTb, CMRG, playWEB, TOMMY, SMURF, MZABI, YELL, TEPES, BHDStudio, hallowed, EDPH, ETHEL, GGWP, GNOME |
| Medium | KyoGo, NeoNoir, TORK, QHstudIo, SPARKS, FTW, YIFY (1080p only), Slay3R, Tigole, MkvCage |
| Low | BTM, -E suffix groups, PSA, YIFY (SD/720p), KINGDOM, AOC, LAMA |

Score bonus: Repute High → +30, Medium → +10, Low → drop, Unknown → 0 (flagged).

**Size sanity check (MB/min against runtime):**

| Quality | Min | Max |
|---|---|---|
| WEBDL-1080p | 12 | 80 |
| WEBDL-2160p | 25 | 170 |
| WEBRip-1080p | 8 | 45 |
| WEBRip-2160p | 20 | 110 |

Flag anything outside range as mislabeled or padded.

**Tiebreaker:** usenet > torrent; verified group > unknown.

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
