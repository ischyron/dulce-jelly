import { readFile } from "node:fs/promises";
import { parseCsv, readJson } from "../lib/common.mjs";
import { dataPath } from "../lib/paths.mjs";

const radarrApiKey = process.env.RADARR_API_KEY ?? null;
const radarrBaseUrl = process.env.RADARR_BASE_URL ?? "http://localhost:3273/api/v3";
const preferredQualityProfileName =
  process.env.MOVIES_WANTED_QUALITY_PROFILE_NAME ?? "[SQP] SQP-1 WEB (2160p)";
const preferredQualityProfileId = process.env.MOVIES_WANTED_QUALITY_PROFILE_ID ?? null;
const preferredRootFolderPath = process.env.MOVIES_WANTED_ROOT_FOLDER_PATH ?? null;

function csvPathForBucket(bucket) {
  if (bucket === "english") {
    return dataPath("english-accepted-candidates.csv");
  }
  if (bucket === "foreign") {
    return dataPath("foreign-accepted-candidates.csv");
  }
  return dataPath("accepted_candidates.csv");
}

function membershipKey(title, year) {
  return `${String(title ?? "").toLowerCase()}|${Number(year) || 0}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Api-Key": radarrApiKey,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed with ${response.status}`);
  }

  return response.json();
}

async function fetchRadarrMembership() {
  const movies = await fetchJson(`${radarrBaseUrl}/movie`);
  return {
    tmdbIds: new Set(movies.map((row) => (row?.tmdbId ? String(row.tmdbId) : null)).filter(Boolean)),
    imdbIds: new Set(movies.map((row) => row?.imdbId).filter(Boolean)),
    titleYears: new Set(
      movies.map((row) => membershipKey(row?.title, row?.year)).filter((value) => !value.startsWith("|0"))
    )
  };
}

async function resolveQualityProfileId() {
  if (preferredQualityProfileId) {
    return Number(preferredQualityProfileId);
  }

  const profiles = await fetchJson(`${radarrBaseUrl}/qualityprofile`);
  const exact = profiles.find((profile) => profile?.name === preferredQualityProfileName);
  if (exact) {
    return Number(exact.id);
  }

  const fallback = profiles.find((profile) => Number(profile?.id) === 15) ?? profiles[0] ?? null;
  if (!fallback) {
    throw new Error("No Radarr quality profiles available");
  }
  return Number(fallback.id);
}

async function resolveRootFolderPath() {
  if (preferredRootFolderPath) {
    return preferredRootFolderPath;
  }

  const folders = await fetchJson(`${radarrBaseUrl}/rootfolder`);
  const folder = folders[0] ?? null;
  if (!folder?.path) {
    throw new Error("No Radarr root folders available");
  }
  return folder.path;
}

async function lookupMovie(title, year) {
  const results = await fetchJson(
    `${radarrBaseUrl}/movie/lookup?term=${encodeURIComponent(`${title} ${year}`)}`
  );
  const lowerTitle = String(title).toLowerCase();
  return (
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle && item.year === year) ??
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle) ??
    results[0] ??
    null
  );
}

async function addMovieToRadarr(movie, qualityProfileId, rootFolderPath) {
  const payload = {
    ...movie,
    monitored: true,
    qualityProfileId,
    rootFolderPath,
    minimumAvailability: movie.minimumAvailability ?? "released",
    addOptions: {
      searchForMovie: true
    }
  };

  await fetchJson(`${radarrBaseUrl}/movie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function main() {
  if (!radarrApiKey) {
    throw new Error("RADARR_API_KEY is required");
  }

  const bucket = String(process.argv[2] ?? "english").trim().toLowerCase();
  const minYear = Number(process.argv[3] ?? 1990);
  const snapshotPath = process.argv[4] ?? null;
  const csvPath = csvPathForBucket(bucket);
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const snapshotKeys = snapshotPath ? new Set((await readJson(snapshotPath, [])).map(String)) : null;
  const qualityProfileId = await resolveQualityProfileId();
  const rootFolderPath = await resolveRootFolderPath();
  const membership = await fetchRadarrMembership();

  let considered = 0;
  let added = 0;
  let skippedExisting = 0;
  let skippedFilter = 0;
  let skippedLookup = 0;

  for (const row of rows) {
    const title = String(row.title ?? "").trim();
    const year = Number(row.year) || 0;
    const key = `${title.toLowerCase()}|${year}`;

    if (!title || year < minYear) {
      skippedFilter += 1;
      continue;
    }

    if (snapshotKeys && snapshotKeys.has(key)) {
      skippedFilter += 1;
      continue;
    }

    considered += 1;

    if (String(row.added_to_radarr ?? "").toLowerCase() === "true" || membership.titleYears.has(membershipKey(title, year))) {
      skippedExisting += 1;
      continue;
    }

    const movie = await lookupMovie(title, year);
    if (!movie?.tmdbId) {
      skippedLookup += 1;
      continue;
    }

    const tmdbId = String(movie.tmdbId);
    const imdbId = movie.imdbId ? String(movie.imdbId) : null;
    if (
      membership.tmdbIds.has(tmdbId) ||
      (imdbId && membership.imdbIds.has(imdbId)) ||
      membership.titleYears.has(membershipKey(movie.title, movie.year))
    ) {
      skippedExisting += 1;
      continue;
    }

    await addMovieToRadarr(movie, qualityProfileId, rootFolderPath);
    membership.tmdbIds.add(tmdbId);
    if (imdbId) {
      membership.imdbIds.add(imdbId);
    }
    membership.titleYears.add(membershipKey(movie.title, movie.year));
    membership.titleYears.add(membershipKey(title, year));
    added += 1;
  }

  console.log(
    JSON.stringify(
      {
        bucket,
        minYear,
        considered,
        added,
        skippedExisting,
        skippedFilter,
        skippedLookup
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
