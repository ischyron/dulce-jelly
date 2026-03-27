---
name: upgrade-batch
description: Batch upgrade pipeline for YTS-tagged movies in Radarr. Pulls the YTS-to-upgrade tag list, applies genre + RT eligibility rules, scouts each title using release-scout logic, and splits into AUTO_GRAB and MANUAL_REVIEW queues with storage watermark gating.
allowed-tools: Bash, Read
---

# Upgrade Batch

Pulls all Radarr movies tagged `YTS-to-upgrade`, applies upgrade eligibility rules, scouts each title, and produces two output queues: AUTO_GRAB (usenet, low-risk, gated) and MANUAL_REVIEW.

Per-title release evaluation follows the scoring, DV classification, physics sanity, and repute logic in `release-scout`. This skill handles the batch orchestration layer; see `.claude/skills/release-scout/SKILL.md` for the full evaluation rules.

---

## First-Time Setup — Find Your YTS_TAG_ID

**Run this once before first use.** The tag ID is numeric and assigned by Radarr internally — it is not predictable.

```bash
source .env 2>/dev/null
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:${RADARR_PORT:-3273}/api/v3/tag" | \
  python3 -c "
import json, sys
for t in json.load(sys.stdin):
    print(f'id={t[\"id\"]:3}  label={t[\"label\"]}')
"
```

Look for the tag labelled `yts-to-upgrade` (or however it appears in your Radarr). Note the `id` value.

Add it to `.env`:
```
YTS_TAG_ID=<n>
```

Then verify it works — at least one known YTS title should appear:
```bash
source .env
curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:${RADARR_PORT:-3273}/api/v3/movie" | \
  python3 -c "
import json, sys, os
YTS_TAG_ID = int(os.environ['YTS_TAG_ID'])
movies = [m for m in json.load(sys.stdin) if YTS_TAG_ID in m.get('tags', [])]
print(f'Movies with YTS tag ({YTS_TAG_ID}): {len(movies)}')
for m in movies[:5]:
    print(f'  {m[\"title\"]} ({m[\"year\"]})')
"
```

---

## How It Works

1. **B1 — Storage check:** Compute safe budget against `UPGRADE_WATERMARK_PCT` ceiling (default 85%). Abort if < 50 GB headroom.
2. **B2 — Pull candidates:** Query Radarr for all movies with the `YTS-to-upgrade` tag; extract RT, IMDb, genres.
3. **B3 — Eligibility filter:** Apply genre rules and RT floors; split into `auto_upgrade`, `manual_review`, `skipped`.
4. **B4 — Scout each auto-upgrade title:** Run single-title release scout (Steps 3–7 in release-scout) for each; apply AUTO_GRAB gate; push passing releases, move failures to MANUAL_REVIEW.
5. **B5 — Write output CSVs:** `temp/upgrade-batch/auto-grab.csv` and `temp/upgrade-batch/manual-review.csv`.

---

## Step B1 — Storage Headroom Check

```bash
source .env 2>/dev/null
MEDIA_PATH="${JELLYFIN_MOVIES:-$HOME/Media/MEDIA1/Movies}"
HEADROOM_GB=$(df -BG "$MEDIA_PATH" | awk 'NR==2 {gsub("G","",$4); print $4}')
WATERMARK_PCT=${UPGRADE_WATERMARK_PCT:-85}
TOTAL_GB=$(df -BG "$MEDIA_PATH" | awk 'NR==2 {gsub("G","",$2); print $2}')
WATERMARK_GB=$(echo "$TOTAL_GB $WATERMARK_PCT" | awk '{printf "%d", $1 * $2 / 100}')
USED_GB=$(echo "$TOTAL_GB $HEADROOM_GB" | awk '{print $1 - $2}')
SAFE_BUDGET_GB=$(echo "$WATERMARK_GB $USED_GB" | awk '{if ($1>$2) print $1-$2; else print 0}')

echo "Volume: ${MEDIA_PATH}"
echo "Total: ${TOTAL_GB}GB  Used: ${USED_GB}GB  Free: ${HEADROOM_GB}GB"
echo "Watermark: ${WATERMARK_PCT}% = ${WATERMARK_GB}GB  Safe budget: ${SAFE_BUDGET_GB}GB"

if [ "$SAFE_BUDGET_GB" -lt 50 ]; then
  echo "⚠ Less than 50GB safe budget — abort batch or expand storage first."
  exit 1
fi
```

Set `UPGRADE_WATERMARK_PCT` in `.env` to control the ceiling (default 85%). Each YTS→WEB-DL 2160p upgrade costs ~16–18 GB net (new file ~20 GB minus ~2 GB YTS freed). Budget accordingly.

Storage note: the CCC mirror is a 1:1 transparent backup — `df` on the primary gives the correct available figure. Do not count the mirror as additional usable space.

---

## Step B2 — Pull YTS-to-Upgrade Candidate List

```bash
BATCH_TS=$(date '+%d%b-%I%M%p' | tr '[:upper:]' '[:lower:]')
BATCH_DIR="temp/upgrade-batch/${BATCH_TS}"
mkdir -p "$BATCH_DIR"
echo "Session dir: $BATCH_DIR"

curl -s -H "X-Api-Key: $RADARR_API_KEY" \
  "http://localhost:${RADARR_PORT:-3273}/api/v3/movie" | \
python3 -c "
import json, sys, os

movies = json.load(sys.stdin)
YTS_TAG_ID = int(os.environ.get('YTS_TAG_ID', '0'))
if YTS_TAG_ID == 0:
    print('ERROR: YTS_TAG_ID not set. Run first-time setup above.', file=sys.stderr)
    sys.exit(1)

candidates = []
for m in movies:
    if YTS_TAG_ID not in m.get('tags', []):
        continue
    r = m.get('ratings', {})
    rt    = r.get('rottenTomatoes', {}).get('value')
    imdb  = r.get('imdb', {}).get('value')
    votes = r.get('imdb', {}).get('votes', 0)
    genres = [g['name'] for g in m.get('genres', [])]
    candidates.append({
        'id':      m['id'],
        'title':   m['title'],
        'year':    m['year'],
        'rt':      rt,
        'imdb':    imdb,
        'votes':   votes,
        'genres':  genres,
        'profile': m['qualityProfileId'],
        'hasFile': m['hasFile'],
        'runtime': m.get('runtime', 0),
    })

print(json.dumps(candidates, indent=2))
" | tee "${BATCH_DIR}/yts-candidates-raw.json"

echo "Total YTS-tagged movies: $(python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < "${BATCH_DIR}/yts-candidates-raw.json")"
```

---

## Step B3 — Apply Upgrade Eligibility Rules

```bash
python3 -c "
import json, sys, os

candidates = json.load(open('${BATCH_DIR}/yts-candidates-raw.json'))

# ── Genre classification helpers ──────────────────────────────────────────
HARD_EXCLUDE = {'Musical', 'Music'}          # skip entirely, no scout
MANUAL_ONLY  = {'Horror', 'Documentary'}     # never auto-grab; flag for manual

def is_ghibli(m):
    # Radarr does not expose studio reliably; use known title list as fallback
    # Add known titles to this set as you identify them in your library
    GHIBLI_TITLES = {
        'Spirited Away', 'My Neighbor Totoro', 'Princess Mononoke',
        'Howl\\'s Moving Castle', 'Nausicaä of the Valley of the Wind',
        'Castle in the Sky', 'Kiki\\'s Delivery Service', 'Porco Rosso',
        'The Tale of the Princess Kaguya', 'The Wind Rises', 'Grave of the Fireflies',
        'Castle of Cagliostro', 'Pom Poko', 'Only Yesterday', 'My Neighbors the Yamadas',
        'The Cat Returns', 'Arrietty', 'From Up on Poppy Hill', 'The Boy and the Heron',
        'When Marnie Was There',
    }
    return m['title'] in GHIBLI_TITLES

# ── RT floor by primary genre ─────────────────────────────────────────────
RT_FLOORS = {
    'Action':    78, 'Science Fiction': 78, 'Sci-Fi': 78,
    'Fantasy':   78, 'Adventure': 78, 'War': 78,
    'Crime':     80, 'Thriller': 80, 'Mystery': 80,
    'Horror':    None,   # manual only
    'Animation': 82,
    'Drama':     88,
    'Music':     88,
    'Romance':   85,
    'Comedy':    85,
    'Western':   80,
    'History':   80,
    'Biography': 82,
}
RT_FLOOR_DEFAULT = 88   # any genre not listed above

# ── Tier 1: undeniable threshold (overrides genre floor) ──────────────────
TIER1_RT = 90

auto_upgrade   = []
manual_review  = []
skipped        = []

for m in candidates:
    genres  = m['genres']
    rt      = m['rt']
    title   = m['title']

    # Hard excludes
    if any(g in HARD_EXCLUDE for g in genres):
        skipped.append({**m, 'skip_reason': 'genre excluded (' + ', '.join(g for g in genres if g in HARD_EXCLUDE) + ')'})
        continue

    # Anime: exclude unless Ghibli (best-effort detection)
    if 'Animation' in genres and any(kw in title for kw in ['anime','Anime']) or \
       any(g in genres for g in ['Animation']) and not is_ghibli(m) and \
       m.get('originalLanguage','') in ['ja','Japanese']:
        if not is_ghibli(m):
            skipped.append({**m, 'skip_reason': 'anime non-Ghibli excluded'})
            continue

    # Manual-only genres
    if any(g in MANUAL_ONLY for g in genres):
        manual_review.append({**m, 'review_reason': 'manual-only genre: ' + ', '.join(g for g in genres if g in MANUAL_ONLY)})
        continue

    # RT missing — run Step 2.5 critic verification (FlareSolverr) before giving up
    if rt is None:
        # Queue for FlareSolverr lookup rather than immediately routing to manual.
        # Run: python3 temp/release-scout/verify_critics.py \"<title>\" <year>
        # If Step 2.5 returns RT >= 75% with >= 10 reviews, re-insert with fetched rt value.
        # If Step 2.5 returns only MC: route to manual_review with mc_score attached.
        # If Step 2.5 returns nothing reliable: route to manual_review.
        manual_review.append({**m, 'review_reason': 'RT unavailable — run Step 2.5 FlareSolverr verification before skipping'})
        continue

    # Tier 1: undeniable
    if rt >= TIER1_RT:
        auto_upgrade.append({**m, 'tier': 1, 'rt_floor': TIER1_RT})
        continue

    # Tier 2: genre-gated
    primary_genre = genres[0] if genres else ''
    floor = None
    for g in genres:
        f = RT_FLOORS.get(g)
        if f is not None:
            floor = min(floor, f) if floor else f   # use most permissive matching genre
    if floor is None:
        floor = RT_FLOOR_DEFAULT

    if rt >= floor:
        auto_upgrade.append({**m, 'tier': 2, 'rt_floor': floor})
    else:
        skipped.append({**m, 'skip_reason': f'RT {rt}% below floor {floor}% for {primary_genre}'})

# Sort auto_upgrade: Tier 1 first, then RT descending
auto_upgrade.sort(key=lambda x: (-x['tier'], -(x['rt'] or 0)))

result = {
    'auto_upgrade':  auto_upgrade,
    'manual_review': manual_review,
    'skipped':       skipped,
    'summary': {
        'total_candidates': len(candidates),
        'auto_upgrade':     len(auto_upgrade),
        'manual_review':    len(manual_review),
        'skipped':          len(skipped),
    }
}
print(json.dumps(result, indent=2))
" < "${BATCH_DIR}/yts-candidates-raw.json" | tee "${BATCH_DIR}/upgrade-queue.json"

python3 -c "
import json, sys
d = json.load(sys.stdin)['summary']
print(f\"Auto-upgrade queue: {d['auto_upgrade']}  Manual review: {d['manual_review']}  Skipped: {d['skipped']}\")
" < "${BATCH_DIR}/upgrade-queue.json"
```

---

## Step B4 — Scout Each Auto-Upgrade Candidate

For each title in `auto_upgrade`, run the standard single-title scout (Steps 3–7 in release-scout — movie ID is already known from Step B2; skip Step 2). Apply the **AUTO_GRAB gate** after ranking:

**AUTO_GRAB gate — all conditions must pass:**

| Condition | Requirement |
|---|---|
| Risk Level | Low only |
| Protocol | usenet only |
| Repute | High or Medium-with-verified-paid-source |
| CF score | ≥ 2500 |
| DV profile | P5/8 or no DV (HDR10); never Hybrid DV or P7 |
| Audio | DD+/Atmos or AAC; never TrueHD or DTS-HD MA |
| Physics | Pass (size within MB/min range; no WEB-DL+lossless flag) |
| NZB age | ≤ 180 days |
| History | No prior failed grab for this group on this title |
| Storage budget | Cumulative grabbed GB < `SAFE_BUDGET_GB` |

If any condition fails → move to MANUAL_REVIEW with the specific failing condition noted.

**Storage budget tracking:**
```bash
GRABBED_GB=0
MAX_GB=$SAFE_BUDGET_GB

# Before each grab:
if (( GRABBED_GB + RELEASE_SIZE_GB > MAX_GB )); then
  echo "⚠ Budget exhausted (${GRABBED_GB}GB grabbed). Stopping batch."
  break
fi
GRABBED_GB=$((GRABBED_GB + RELEASE_SIZE_GB))
```

---

## Step B5 — Write Output Queues

```bash
python3 << 'PYEOF'
import json, csv

# Write AUTO_GRAB results
with open('temp/upgrade-batch/auto-grab.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Title','Year','RT','Genres','Release','Quality','SizeGB','Group','Repute','Audio','DV','Score','Tier'])
    for item in auto_grab_results:   # populated during Step B4
        w.writerow([item['title'], item['year'], item['rt'], '|'.join(item['genres']),
                    item['release'], item['quality'], item['size_gb'], item['group'],
                    item['repute'], item['audio'], item['dv_profile'], item['score'], item['tier']])

# Write MANUAL_REVIEW queue
with open('temp/upgrade-batch/manual-review.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Title','Year','RT','Genres','ReviewReason','BestRelease','RiskLevel','Why'])
    for item in manual_review_results:
        w.writerow([item['title'], item['year'], item['rt'], '|'.join(item['genres']),
                    item['review_reason'], item.get('best_release','—'),
                    item.get('risk_level','—'), item.get('why','—')])
PYEOF

echo "Output written:"
echo "  temp/upgrade-batch/auto-grab.csv     — grabs already pushed to Radarr/SABnzbd"
echo "  temp/upgrade-batch/manual-review.csv — your review queue (Horror, Docs, risky releases)"
```

---

## Upgrade Eligibility Rules (Reference)

**Critic score source:** Rotten Tomatoes (TomatoScore) is the sole programmatic gate. Metacritic is not reliably available in Radarr. IMDb score + votes used as corroboration only — never as a hard gate.

**Tier 1 — Undeniable (RT ≥ 90%, any genre except hard excludes)**
All genres except Musical, non-Ghibli Anime, and non-Ghibli Animation qualify automatically. No further genre check needed.

**Tier 2 — Genre-gated RT floors**

| Genre | RT floor | Notes |
|---|---|---|
| Action / Sci-Fi / Fantasy / Adventure / War | 78% | Visual spectacle; 4K DV upgrade gap is large |
| Crime / Thriller / Mystery / Western / History | 80% | Strong rewatch value |
| Animation (non-anime studio) | 82% | Studio masters excel in 4K |
| Studio Ghibli | 82% | Treated as studio animation regardless of anime origin |
| Biography | 82% | — |
| Romance / Comedy | 85% | Low format benefit; high bar |
| Drama / Music (genre tag) | 88% | Near-Tier-1 threshold; flag for review even when eligible |

**Hard excludes (never scout, never upgrade):**
- Musical
- Anime (non-Ghibli) — best-effort detection; borderline cases flag for review

**Manual-only (scout but never auto-grab — always in MANUAL_REVIEW):**
- Horror — taste-specific; personal exceptions curated manually (e.g. Carrie, Shutter)
- Documentary — cultural/historical importance not measurable by RT; curate manually

**IMDb corroboration (soft signal, not gate):**
When RT feels thin (< 20 critic reviews), require IMDb ≥ 7.5 with ≥ 100K votes to confirm the RT score is not a fluke. Flag for manual review if IMDb corroboration is missing.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `YTS_TAG_ID` | — | **Required.** Radarr tag ID for the YTS-to-upgrade tag. Find via `GET /api/v3/tag` (see First-Time Setup above). |
| `UPGRADE_WATERMARK_PCT` | `85` | Storage watermark ceiling as a percentage of total volume. Batch stops when used space exceeds this. |
| `JELLYFIN_MOVIES` | `$HOME/Media/MEDIA1/Movies` | Path to primary movie library volume; used for `df` headroom check. |
| `RADARR_PORT` | `3273` | Radarr host port. |

---

## Temp File Layout

```
temp/upgrade-batch/
└── 28feb-0230pm/                  # one directory per batch run
    ├── yts-candidates-raw.json    # raw Radarr tag query output (Step B2)
    ├── upgrade-queue.json         # eligibility filter output (Step B3)
    ├── auto-grab.csv              # grabbed releases
    └── manual-review.csv          # your review queue
```

`temp/` is gitignored. Clean up with `rm -rf temp/upgrade-batch/`.
