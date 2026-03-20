---
name: movie-recommendation
description: Build and maintain /tmp/movie_recommendations.csv for this Dulce Jelly stack by using Jellyfin as the library source of truth, Rotten Tomatoes as the only critic-score gate, IMDb via FlareSolverr for metadata when needed, and Radarr for add-and-search after approval.
---

# Movie Recommendation

Use this skill when the user wants movie recommendations for this repo's media stack, wants to append to the shared CSV, wants validation against the live Jellyfin library, wants Rotten Tomatoes links, wants IMDb-via-FlareSolverr metadata, or wants approved recommendations added to Radarr and searched.

## Role

Act as a film-critic-style curator for this Dulce Jelly stack.
Use Jellyfin as the ownership source of truth, Rotten Tomatoes as the only critic-score source for recommendation decisions, IMDb via FlareSolverr for metadata when needed, and Radarr only after explicit approval.
Prefer strong critical picks over broad popularity, preserve the shared CSV workflow in `/tmp/movie_recommendations.csv`, and avoid repeat recommendations already present in Jellyfin.
Treat older titles as prestige-only additions, not general accumulation. Do not recommend older films just to backfill decades or increase era coverage; recommend them only when they are clearly canonical, elite, or otherwise defensibly high-prestige picks.

## Output contract

- Working CSV path: `/tmp/movie_recommendations.csv`
- CSV schema:

```csv
Movie,Year,RottenTomatoesLink
```

- Keep this file as the single working recommendation list.
- When adding more recommendations, append only new valid rows after rechecking the whole file against Jellyfin.
- Default batch size for new recommendation runs: `10`
- Report when the CSV was updated.
- Always open the newly added Rotten Tomatoes links in Chrome tabs after updating the CSV.
- Do not add anything to Radarr until the user explicitly reviews the CSV/tabs and confirms.
- After approval, add only missing titles to Radarr and trigger a Radarr search for each newly added title.

## Required stack access

- Jellyfin:
  - Base URL: `http://localhost:3278`
  - Read the API token from repo `.env` key `JELLFIN_SERVICE_AGENT_API_KEY`
  - Auth header: `X-Emby-Token: <value from .env>`
  - Movies library id in this stack is usually `f137a2dd21bbc1b99aa5c0f6bf02a805`, but prefer fetching `/Library/VirtualFolders` and selecting `CollectionType == "movies"` rather than hard-coding it.
- Radarr:
  - Base URL: `http://localhost:3273`
  - Read the API key from repo `.env` key `RADARR_API_KEY`
  - Root folder: `/movies`
  - Quality profile: `[SQP] SQP-1 WEB (2160p)` and its current id has been `15`, but verify with `/api/v3/qualityProfile` instead of assuming.
- FlareSolverr:
  - Direct host access does not work reliably from the host.
  - Route IMDb requests through the Docker network via `prowlarr`.
  - Use FlareSolverr for Rotten Tomatoes page fetches when direct host fetches are blocked or unreliable.
  - Do not rely on TMDB as a required live source for this skill. TMDB may be blocked in this environment and is optional only.
  - Working pattern:

```sh
docker exec prowlarr sh -lc 'curl -sS -H "Content-Type: application/json" \
  -d '\''{"cmd":"request.get","url":"https://www.imdb.com/title/tt0111161/","maxTimeout":60000}'\'' \
  http://flaresolverr:8191/v1'
```

- Rotten Tomatoes:
  - Direct page fetches usually work from the host.
  - Direct RT search endpoints are unreliable; use direct slug guesses first, then Bing RSS fallback.
  - If direct RT fetch fails or is blocked, retry the RT page fetch through FlareSolverr before giving up on that candidate.

## Live source usage hints

- Jellyfin ownership check:
  - Fetch libraries first and select the one with `CollectionType == "movies"`:

```sh
curl -sS -H "X-Emby-Token: $JELLFIN_SERVICE_AGENT_API_KEY" \
  "http://localhost:3278/Library/VirtualFolders"
```

  - Then fetch movie items from the movies library id:

```sh
curl -sS -H "X-Emby-Token: $JELLFIN_SERVICE_AGENT_API_KEY" \
  "http://localhost:3278/Users/<userId>/Items?ParentId=<moviesLibraryId>&Recursive=true&IncludeItemTypes=Movie&Fields=ProviderIds,OriginalTitle,ProductionYear"
```

  - Normalize Jellyfin names before comparison and treat Jellyfin as the ownership source of truth.

- FlareSolverr access pattern:
  - Host access is unreliable; route requests through `prowlarr` on the Docker network.
  - Reusable pattern:

```sh
docker exec prowlarr sh -lc 'curl -sS -H "Content-Type: application/json" \
  -d '\''{"cmd":"request.get","url":"<URL>","maxTimeout":60000}'\'' \
  http://flaresolverr:8191/v1'
```

  - Check the response `status` and then read `solution.response` or `solution.url` from the JSON payload.
  - Keep hard timeouts on every FlareSolverr request and skip a candidate if repeated fetches fail.

- IMDb usage:
  - Use IMDb through FlareSolverr for metadata only.
  - Recommended sequence:
    - IMDb find query:

```text
https://www.imdb.com/find/?q=<title>&s=tt&ttype=ft&ref_=fn_ft
```

    - Parse candidate `tt...` ids from the result HTML.
    - Fetch a few matching title pages through FlareSolverr.
    - Parse IMDb JSON-LD for `name`, `datePublished`, `duration`, and `genre`.
  - Do not use IMDb rating as a critic proxy or fallback quality gate.

- Rotten Tomatoes usage:
  - Rotten Tomatoes is the only critic gate for this skill.
  - Try direct slug guesses first:

```text
https://www.rottentomatoes.com/m/<slug>_<year>
https://www.rottentomatoes.com/m/<slug>
```

  - If slug guessing fails, use Bing RSS to discover the RT page:

```text
https://www.bing.com/search?format=rss&q=site:rottentomatoes.com/m "<title>" <year>
```

  - After finding the RT URL, fetch it directly from the host first.
  - If host fetch fails or is blocked, fetch that exact RT URL through FlareSolverr via `prowlarr`.
  - Confirm exact title/year match before reading the critic score from page JSON/JSON-LD.
  - If RT verification fails, skip the candidate. Do not substitute IMDb, TMDB, or Radarr ratings.

- Radarr usage:
  - Radarr is only for post-approval add-and-search.
  - It is not a recommendation discovery tool and not a critic-score source.
  - Use it only after the CSV batch has already passed Jellyfin ownership checks and Rotten Tomatoes verification.

## Source-of-truth rules

- Jellyfin is the ownership source of truth.
- Rotten Tomatoes is the only critic-score source of truth for this skill and must also supply the final link in the CSV.
- IMDb via FlareSolverr is a metadata source only. Do not use IMDb rating as a critic proxy or as a substitute for Rotten Tomatoes.
- TMDB is optional metadata only. Do not use TMDB as a critic proxy or as a gating dependency for recommendation quality.
- Radarr metadata enrichment is not a recommendation gate. Do not add a title to Radarr just to let Radarr fetch ratings and then decide later.
- If a required live source is blocked or unavailable for the current workflow, stop and report the failing service. Do not fabricate or silently downgrade quality checks.

## Current recommendation rules

- Recommend only movies not already present in Jellyfin.
- Never recommend a movie unless its Rotten Tomatoes critic score has been directly verified from a Rotten Tomatoes page for that exact title and year.
- Never substitute IMDb score, TMDB score, popularity, or Radarr-fetched metadata for the Rotten Tomatoes critic gate.
- Apply these exact Rotten Tomatoes acceptance thresholds after exact title/year verification:
  - `1960-1989` English-language movies: Rotten Tomatoes critic score `>= 85`
  - `1960-1989` non-English movies: Rotten Tomatoes critic score `>= 92`
  - `1990+` English-language movies: Rotten Tomatoes critic score `>= 80`
  - `1990+` non-English movies: Rotten Tomatoes critic score `>= 90`
- Treat `1960-1989` titles as prestige-only additions, not general accumulation.
  - Do not treat older decades as a quota or coverage target by themselves.
  - Reject merely decent or borderline older titles even if they barely clear the numeric floor.
  - Keep older titles only when they are clearly canonical, elite, or otherwise defensibly high-prestige picks.
- Penalize saturated mainstream slices from `2000-2019`.
  - Apply an extra selectivity penalty to `Drama`, `Thriller`, `Action`, and `Comedy` from the `2000s` and `2010s`.
  - Do not recommend those titles unless the Rotten Tomatoes critic score is clearly above the base floor.
  - Current working interpretation: for `2000-2019` titles in any of those genres, prefer `RT >= 90`, and reject marginal `80s` scores unless the title is otherwise exceptional.
- Exclude:
  - Documentary
  - Animation
  - History, Music
  - Musical
  - Film noir
  - Short films
  - movies older than 1960
- Determine short-film exclusion by runtime, not only by genre. Exclude if runtime is typically short-film length; current working cutoff has been `<= 45 minutes`.

## Avoid repeating the earlier Jellyfin bug

- Jellyfin names may include a trailing year inside the title string, for example:
  - `Take Shelter (2011)`
  - `The Nice Guys (2016)`
- Always normalize Jellyfin `Name` by stripping a trailing ` (YYYY)` before comparison.
- Also normalize:
  - accents
  - apostrophes
  - `&` to `and`
  - extra whitespace
  - leading articles when comparing keys
- Safe comparison key:

```text
normalized_title_without_trailing_parenthetical_year + "|" + ProductionYear
```

- Revalidate the entire existing CSV against Jellyfin before appending new rows.

## Recommended workflow

1. Load the current CSV from `/tmp/movie_recommendations.csv` if it exists.
2. Fetch the full Jellyfin movie library and build normalized `title|year` ownership keys.
3. Remove any rows from the CSV that are already in Jellyfin.
4. Build a candidate slate.
   - Prefer strong critical candidates.
   - For older titles, prefer prestige picks only; do not fill older decades with merely decent films.
   - For `2000-2019` `Drama`, `Thriller`, `Action`, and `Comedy`, use a stricter bar than the base decade/language threshold and keep only clearly standout titles.
   - Prefer English-heavy slates when IMDb search resolution is fragile.
   - Use curated candidate batches rather than giant discovery sweeps when reliability matters.
   - Do not include any candidate whose Rotten Tomatoes critic score has not yet been verified from Rotten Tomatoes.
5. For each candidate:
   - Resolve IMDb page through FlareSolverr.
   - Parse IMDb JSON-LD for `name`, `datePublished`, `duration`, and `genre`.
   - Infer language from page content or `review.inLanguage` only if necessary.
   - Apply genre/runtime/year filters.
   - Resolve Rotten Tomatoes page.
   - Confirm RT title/year match.
   - Read critic score from page JSON/JSON-LD.
   - If direct RT fetch fails, retry RT through FlareSolverr before skipping the candidate.
   - Infer whether the title is English-language or non-English before applying thresholds.
   - Enforce the exact decade/language RT thresholds.
   - If the title is from `1960-1989`, apply the prestige-only rule before keeping it in the slate.
   - If the title is from `2000-2019` and includes `Drama`, `Thriller`, `Action`, or `Comedy`, apply the saturated-slice penalty and keep it only if the RT score is clearly high enough to survive that stricter bar.
   - Recheck against Jellyfin normalized `title|year`.
   - Recheck against existing CSV normalized `title|year`.
   - Only after RT verification succeeds may the title remain in the slate.
6. Append only new valid rows to `/tmp/movie_recommendations.csv`.
7. Open the newly added RT links in Chrome tabs.
8. Stop and wait for review.
9. Only after explicit user approval, add titles to Radarr:
   - Query Radarr current movies.
   - Add only missing titles.
   - Use root folder `/movies`.
   - Use quality profile `[SQP] SQP-1 WEB (2160p)`.
   - Trigger a Radarr search for each newly added title.

## IMDb via FlareSolverr notes

- Use IMDb find pages plus title pages through FlareSolverr.
- Keep per-request hard timeouts; FlareSolverr sessions can otherwise hang.
- Good approach:
  - IMDb find query: `https://www.imdb.com/find/?q=<title>&s=tt&ttype=ft&ref_=fn_ft`
  - Parse `tt...` ids from the result HTML.
  - Fetch a few candidate title pages.
  - Match by normalized title and exact year.
- If a title repeatedly fails IMDb resolution, skip it and move on instead of stalling the run.

## Rotten Tomatoes notes

- Try direct slugs first:
  - `/m/<slug>_<year>`
  - `/m/<slug>`
- If direct slugs fail, use Bing RSS:

```text
https://www.bing.com/search?format=rss&q=site:rottentomatoes.com/m "<title>" <year>
```

- Parse RT page JSON/JSON-LD for title and critic score.
- Reject mismatched title/year pages even if the slug resolves.
- If host-side RT fetch is blocked, retry the exact RT URL through FlareSolverr via `prowlarr`.
- Do not fall back to IMDb score, TMDB score, or Radarr ratings when RT verification fails.

## Radarr add-and-search procedure

- Verify the quality profile id rather than assuming it.
- Do not add titles to Radarr in order to trigger Radarr metadata refreshes for recommendation gating.
- Recommendation gating must be complete before any Radarr add call.
- Lookup the movie in Radarr before adding:
  - `/api/v3/movie/lookup?term=<title year>`
- Add only if no normalized `title|year` match already exists in Radarr.
- Payload essentials:
  - `tmdbId`
  - `qualityProfileId`
  - `rootFolderPath: "/movies"`
  - `monitored: true`
  - `minimumAvailability: "released"`
  - `addOptions.searchForMovie: true`
- After add, trigger a search for that exact movie id.
- If the user says "add only if missing", skip existing Radarr items instead of updating them.

### Specific API calls

- Get quality profiles:

```http
GET /api/v3/qualityProfile
X-Api-Key: <RADARR_API_KEY>
```

- Get existing Radarr movies:

```http
GET /api/v3/movie?includeMovieFile=true
X-Api-Key: <RADARR_API_KEY>
```

- Lookup a movie before add:

```http
GET /api/v3/movie/lookup?term=<title%20year>
X-Api-Key: <RADARR_API_KEY>
```

- Add a movie:

```http
POST /api/v3/movie
X-Api-Key: <RADARR_API_KEY>
Content-Type: application/json

{
  "tmdbId": <tmdbId>,
  "title": "<resolved title>",
  "qualityProfileId": <verified profile id>,
  "rootFolderPath": "/movies",
  "monitored": true,
  "minimumAvailability": "released",
  "addOptions": {
    "searchForMovie": true
  }
}
```

- Trigger a search for a specific added movie id:

```http
POST /api/v3/command
X-Api-Key: <RADARR_API_KEY>
Content-Type: application/json

{
  "name": "MoviesSearch",
  "movieIds": [<radarrMovieId>]
}
```

- Only run the add/search calls after the user explicitly confirms the reviewed batch.

## Chrome tab procedure

- Open only the newly appended RT links, not the whole CSV.
- Use background tabs for all but one foreground tab.

## Completion checklist

- `/tmp/movie_recommendations.csv` exists and is updated.
- CSV contains only `Movie,Year,RottenTomatoesLink`.
- Every row has been rechecked against Jellyfin with the corrected matcher.
- Newly appended rows are unique against both Jellyfin and the CSV.
- If requested, newly added rows were opened in Chrome tabs.
- If requested, only missing titles were added to Radarr and a search was triggered for each newly added title.
