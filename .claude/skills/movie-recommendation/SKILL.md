---
name: movie-recommendation
description: Build and maintain /tmp/movie_recommendations.csv for this Dulce Jelly stack by using Jellyfin as the library source of truth, Rotten Tomatoes for critic-score links, IMDb via FlareSolverr when metadata is needed, and Radarr for add-and-search after approval.
---

# Movie Recommendation

Use this skill when the user wants movie recommendations for this repo's media stack, wants to append to the shared CSV, wants validation against the live Jellyfin library, wants Rotten Tomatoes links, wants IMDb-via-FlareSolverr metadata, or wants approved recommendations added to Radarr and searched.

## Role

Act as a film-critic-style curator for this Dulce Jelly stack.
Use Jellyfin as the ownership source of truth, Rotten Tomatoes as the critic-score source, IMDb via FlareSolverr for metadata when needed, and Radarr only after explicit approval.
Prefer strong critical picks over broad popularity, preserve the shared CSV workflow in `/tmp/movie_recommendations.csv`, and avoid repeat recommendations already present in Jellyfin.

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
  - Working pattern:

```sh
docker exec prowlarr sh -lc 'curl -sS -H "Content-Type: application/json" \
  -d '\''{"cmd":"request.get","url":"https://www.imdb.com/title/tt0111161/","maxTimeout":60000}'\'' \
  http://flaresolverr:8191/v1'
```

- Rotten Tomatoes:
  - Direct page fetches work from the host.
  - Direct RT search endpoints are unreliable; use direct slug guesses first, then Bing RSS fallback.

## Source-of-truth rules

- Jellyfin is the ownership source of truth.
- Rotten Tomatoes is the critic-score source of truth and must also supply the final link in the CSV.
- IMDb via FlareSolverr is the metadata source for runtime, genre, year, and language when TMDB is unavailable or intentionally not used.
- If a required live source is blocked or unavailable for the current workflow, stop and report the failing service. Do not fabricate or silently downgrade quality checks.

## Current recommendation rules

- Recommend only movies not already present in Jellyfin.
- Minimum critic quality: Rotten Tomatoes critic score >= 70 for English-language movies.
- For non-English primary language, require Rotten Tomatoes critic score >= 90.
- Exclude:
  - documentaries
  - animation
  - film noir
  - short films
  - movies older than 1950
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
   - Prefer English-heavy slates when IMDb search resolution is fragile.
   - Use curated candidate batches rather than giant discovery sweeps when reliability matters.
5. For each candidate:
   - Resolve IMDb page through FlareSolverr.
   - Parse IMDb JSON-LD for `name`, `datePublished`, `duration`, and `genre`.
   - Infer language from page content or `review.inLanguage` only if necessary.
   - Apply genre/runtime/year filters.
   - Resolve Rotten Tomatoes page.
   - Confirm RT title/year match.
   - Read critic score from page JSON/JSON-LD.
   - Enforce the English/non-English RT thresholds.
   - Recheck against Jellyfin normalized `title|year`.
   - Recheck against existing CSV normalized `title|year`.
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

## Radarr add-and-search procedure

- Verify the quality profile id rather than assuming it.
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
