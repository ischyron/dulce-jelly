# YTS Quality Upgrade Task

**Goal:** Replace YTS/YIFY-sourced encodes in the library with proper WEB-DL or Bluray releases,
prioritising highly-acclaimed titles (RT ≥ 85 or Metacritic ≥ 70), excluding Documentary, Musical, Animation, and Dance genres.

**Scope:** 511 qualifying titles identified 2026-02-27.
**Full list:** `temp/yts-upgrade-list.md` (gitignored, regenerate via Radarr API).

---

## Approach

Use `/release-scout <title> <year>` per movie. Apply these decision rules:

| Condition | Action |
|---|---|
| Score ≥ 2500, English, usenet available, quality ≥ current | Auto-grab |
| Only 1080p available, movie on 4K profile | Manual: switch profile to `HD` (id=12) or skip |
| Foreign-language only, no EN alternative | Manual: keep YTS or accept with subs |
| Score < 2500 (untiered P2P only) | Skip — wait for better release |
| Score gap < 200 between top 2 | Manual review |

**After grab:** Radarr auto-imports replacement; YTS file deleted on import. For permanent 4K→HD
profile downgrade, update `qualityProfileId` via Radarr API (see release-scout SKILL.md §9).

---

## Tier 1 — RT ≥ 97 + IMDb ≥ 7.5 (50 movies)

Process in order. Check off when upgraded or disposition noted.

### Group A — Currently labeled 4K (YTS 4K encode → proper source)

- [ ] [1704] Seven Samurai (1954) · RT=100 MC=98 IMDb=8.6 · BD2160p → HQ-4K
- [ ] [5] 12 Angry Men (1957) · RT=100 MC=97 IMDb=9.0 · BD2160p → HQ-4K
- [ ] [240] Casablanca (1943) · RT=99 MC=100 IMDb=8.5 · BD2160p → HQ-4K
- [ ] [939] Rear Window (1954) · RT=99 MC=100 IMDb=8.5 · BD2160p → HQ-4K
- [ ] [271] Citizen Kane (1941) · RT=99 MC=100 IMDb=8.2 · BD2160p → HQ-4K
- [ ] [884] Parasite (2019) · RT=99 MC=97 IMDb=8.5 · BD2160p → HQ-4K
- [ ] [1452] The Third Man (1949) · RT=99 MC=97 IMDb=8.1 · BD2160p → HQ-4K
- [ ] [380] E.T. the Extra-Terrestrial (1982) · RT=99 MC=92 IMDb=7.9 · BD2160p → HQ-4K
- [ ] [368] Dr. Strangelove (1964) · RT=98 MC=97 IMDb=8.3 · BD2160p → HQ-4K
- [ ] [1010] Schindler's List (1993) · RT=98 MC=95 IMDb=9.0 · BD2160p → HQ-4K
- [ ] [1119] Sunset Boulevard (1950) · RT=98 MC=94 IMDb=8.4 · BD2160p → HQ-4K
- [ ] [588] Ikiru (1952) · RT=98 MC=92 IMDb=8.3 · BD2160p → HQ-4K
- [ ] [263] Chinatown (1974) · RT=98 MC=92 IMDb=8.1 · BD2160p → HQ-4K
- [ ] [1480] The Wizard of Oz (1939) · RT=98 MC=92 IMDb=8.1 · BD2160p → HQ-4K
- [ ] [1240] The Father (2020) · RT=98 MC=88 IMDb=8.2 · WDL2160p → HQ-4K
- [ ] [208] Boyhood (2014) · RT=97 MC=100 IMDb=7.9 · BD2160p → HQ-4K
- [ ] [842] North by Northwest (1959) · RT=97 MC=98 IMDb=8.3 · BD2160p → HQ-4K
- [ ] [1266] The Good, the Bad and the Ugly (1966) · RT=97 MC=90 IMDb=8.8 · BD2160p → HQ-4K
- [ ] [736] Mad Max: Fury Road (2015) · RT=97 MC=90 IMDb=8.1 · BD2160p → HQ-4K
- [ ] [644] Jaws (1975) · RT=97 MC=87 IMDb=8.1 · BD2160p → HQ-4K
- [ ] [32] A Bronx Tale (1993) · RT=97 MC=80 IMDb=7.8 · BD2160p → HQ-4K
- [ ] [1721] Airplane! (1980) · RT=97 MC=78 IMDb=7.7 · WDL2160p → HQ-4K
- [ ] [403] Escape from Alcatraz (1979) · RT=97 MC=76 IMDb=7.5 · BD2160p → HQ-4K
- [ ] [607] Infernal Affairs (2002) · RT=94 MC=75 IMDb=8.0 · BD2160p → Efficient-4K

### Group B — On 4K profile but 1080p only (find 4K WEB-DL or proper 1080p)

Markers: 🟢 likely usenet WEB-DL · 🟡 check first · 🔴 manual/foreign

- [ ] 🟡 [1158] The Adventures of Robin Hood (1938) · RT=100 MC=97 · BD1080p → HQ-4K
- [ ] 🟡 [1028] Shadow of a Doubt (1943) · RT=100 MC=94 · BD1080p → HQ-4K
- [ ] 🔴 [31] A Brighter Summer Day (1991) · RT=100 MC=91 · BD1080p → HQ-4K · Taiwanese
- [ ] 🟡 [523] Great Expectations (1946) · RT=100 MC=90 · BD1080p → HQ-4K
- [ ] 🔴 [494] Gett: The Trial of Viviane Amsalem (2014) · RT=100 MC=90 · BD1080p → HQ-4K · Hebrew
- [ ] 🟢 [173] Before Sunrise (1995) · RT=100 MC=79 · BD1080p → HQ-4K
- [ ] 🔴 [53] A Separation (2011) · RT=99 MC=95 · BD1080p → HQ-4K · Farsi
- [ ] 🟢 [682] L.A. Confidential (1997) · RT=99 MC=91 · BD1080p → HQ-4K
- [ ] 🟢 [1485] The Wrestler (2008) · RT=99 MC=80 · BD1080p → HQ-4K
- [ ] 🔴 [938] Rashomon (1950) · RT=98 MC=98 · BD1080p → HQ-4K · Japanese · Criterion only
- [ ] 🟢 [172] Before Midnight (2013) · RT=98 MC=94 · BD1080p → HQ-4K
- [ ] 🟡 [1318] The Last Picture Show (1971) · RT=98 MC=93 · BD1080p → HQ-4K
- [ ] 🔴 [75] All About My Mother (1999) · RT=98 MC=87 · BD1080p → HQ-4K · Spanish
- [ ] 🔴 [318] Das Boot (1981) · RT=98 MC=85 · BD1080p → HQ-4K · German
- [ ] 🟡 [924] Psycho (1960) · RT=97 MC=97 · BD1080p → HQ-4K
- [ ] 🟡 [981] Rosemary's Baby (1968) · RT=97 MC=96 · BD1080p → HQ-4K
- [ ] 🟡 [118] Annie Hall (1977) · RT=97 MC=92 · BD1080p → HQ-4K · limited streaming
- [ ] 🟢 [548] Hell or High Water (2016) · RT=97 MC=88 · BD1080p → HQ-4K
- [ ] 🟢 [576] Hunt for the Wilderpeople (2016) · RT=97 MC=81 · BD1080p → HQ-4K
- [ ] 🟡 [324] Dead Man Walking (1995) · RT=97 MC=80 · BD1080p → HQ-4K
- [ ] 🟢 [515] Good Will Hunting (1997) · RT=97 MC=71 · BD1080p → Efficient-4K
- [ ] 🟡 [1341] The Lunchbox (2013) · RT=97 MC=76 · BD1080p → HQ-4K · Indian/NF
- [ ] 🔴 [247] Cell 211 (2009) · RT=98 · BD1080p → Efficient-4K · Spanish
- [ ] 🟡 [906] Play It Again, Sam (1972) · RT=97 MC=77 · WR1080p → HQ-4K

### Group C — HD profile (1080p target)

- [ ] 🟡 [1172] Culloden (1964) · RT=100 · BD1080p → HD · BFI/BBC
- [ ] 🟡 [1643] Zelig (1983) · RT=97 · BD1080p → HD

---

## Tier 2 — 231 movies (RT ≥ 90 or RT ≥ 85 + MC ≥ 85)

To be processed after Tier 1 completes. Run in bulk using the same per-movie loop.
Regenerate sub-list from `temp/yts-upgrade-list.md` rows 51–281.

## Tier 3 — 230 movies (remaining qualifying)

Run after Tier 2. Lower urgency; more likely to have limited WEB availability.

---

## Profile Reference

| ID | Name | Min Score | Ceiling |
|---|---|---|---|
| 9 | Efficient-4K | 2500 | WEBDL-2160p |
| 10 | HighQuality-4K | 2500 | Bluray-2160p |
| 12 | HD | 2500 | Bluray-1080p |
| 13 | DontUpgrade | 0 | — (frozen) |

## Scoring Quick-Ref (from SKILL.md)

| Signal | Points |
|---|---|
| WEBDL-2160p base | 100 |
| WEBDL-1080p base | 70 |
| ATVP source | +25 |
| AMZN/NF/DSNP/HMAX | +18 |
| WEB Tier 01–03 group | +30 |
| HDR | +10 · HDR10+ +20 |
| DD+/DDP audio | +8 |
| usenet protocol | +10 |
| LQ/YIFY group | −10–15 |
