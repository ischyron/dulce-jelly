import { readFile, writeFile } from "node:fs/promises";
import { readJson, readJsonLines, writeJson } from "../lib/common.mjs";
import { cachePath, dataPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";
const radarrApiKey = process.env.RADARR_API_KEY ?? null;
const radarrBaseUrl = process.env.RADARR_BASE_URL ?? "http://localhost:3273/api/v3";
const languageCachePath = cachePath("accepted_language_cache.json");

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseLanguageName(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value.name) {
    return String(value.name);
  }
  return "";
}

function isEnglishLanguage(value) {
  return /^(english|en)$/i.test(String(value ?? "").trim());
}

function sourceFallbackBucket(row) {
  if (row.sourceList === "oscars_best_international_winners") {
    return "foreign";
  }
  return "english";
}

async function lookupLanguage(title, year, cache) {
  const cacheKey = `${String(title).toLowerCase()}|${year}`;
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  if (!radarrApiKey) {
    const unresolved = {
      bucket: "english",
      language: "",
      source: "no_api_key"
    };
    cache[cacheKey] = unresolved;
    return unresolved;
  }

  const response = await fetch(
    `${radarrBaseUrl}/movie/lookup?term=${encodeURIComponent(`${title} ${year}`)}`,
    {
      headers: {
        "X-Api-Key": radarrApiKey
      }
    }
  );

  if (!response.ok) {
    const unresolved = {
      bucket: "english",
      language: "",
      source: `lookup_http_${response.status}`
    };
    cache[cacheKey] = unresolved;
    return unresolved;
  }

  const results = await response.json();
  const lowerTitle = String(title).toLowerCase();
  const exact =
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle && item.year === year) ??
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle) ??
    results[0] ??
    null;

  const language = parseLanguageName(exact?.originalLanguage);
  const resolved = {
    bucket: isEnglishLanguage(language) ? "english" : language ? "foreign" : null,
    language,
    source: exact ? "radarr_lookup" : "lookup_empty",
    tmdbId: exact?.tmdbId ? String(exact.tmdbId) : null,
    imdbId: exact?.imdbId ? String(exact.imdbId) : null
  };
  cache[cacheKey] = resolved;
  return resolved;
}

async function fetchRadarrMembership() {
  if (!radarrApiKey) {
    return {
      tmdbIds: new Set(),
      imdbIds: new Set(),
      titleYears: new Set()
    };
  }

  const response = await fetch(`${radarrBaseUrl}/movie`, {
    headers: {
      "X-Api-Key": radarrApiKey
    }
  });

  if (!response.ok) {
    return {
      tmdbIds: new Set(),
      imdbIds: new Set(),
      titleYears: new Set()
    };
  }

  const movies = await response.json();
  return {
    tmdbIds: new Set(movies.map((row) => (row?.tmdbId ? String(row.tmdbId) : null)).filter(Boolean)),
    imdbIds: new Set(movies.map((row) => row?.imdbId).filter(Boolean)),
    titleYears: new Set(
      movies
        .map((row) => `${String(row?.title ?? "").toLowerCase()}|${Number(row?.year) || 0}`)
        .filter((value) => !value.startsWith("|0"))
    )
  };
}

async function main() {
  const stateRows = await readJsonLines(statePath("candidates.jsonl"));
  const acceptedRows = stateRows.filter((row) => row.status === "accepted");
  const languageCache = (await readJson(languageCachePath, {})) ?? {};
  const radarrMembership = await fetchRadarrMembership();
  const english = [];
  const foreign = [];
  const accepted = [];

  for (const row of acceptedRows) {
    const resolved = await lookupLanguage(row.title, row.year, languageCache);
    const bucket = resolved.bucket ?? sourceFallbackBucket(row);
    const language = resolved.language || (bucket === "foreign" ? "Unknown non-English" : "English");
    const effectiveTmdbId = row.tmdbId ? String(row.tmdbId) : resolved.tmdbId;
    const effectiveImdbId = row.imdbId ? String(row.imdbId) : resolved.imdbId;
    const addedToRadarr =
      (effectiveTmdbId && radarrMembership.tmdbIds.has(String(effectiveTmdbId))) ||
      (effectiveImdbId && radarrMembership.imdbIds.has(String(effectiveImdbId))) ||
      radarrMembership.titleYears.has(`${String(row.title).toLowerCase()}|${Number(row.year) || 0}`);
    const outputRow = {
      ...row,
      classifiedLanguage: language,
      classifiedBucket: bucket,
      classificationSource: resolved.source || "source_fallback",
      addedToRadarr
    };

    accepted.push(outputRow);
    if (bucket === "foreign") {
      foreign.push(outputRow);
    } else {
      english.push(outputRow);
    }
  }

  const acceptedHeader = "title,year,language,genres,rt_score,rt_url,reason,added_to_radarr";
  const splitHeader =
    "title,year,language,genres,rt_score,rt_url,reason,source_list,classification_source,added_to_radarr";
  const acceptedCsv =
    [
      acceptedHeader,
      ...accepted.map((row) =>
        [
          csvEscape(row.title),
          csvEscape(row.year),
          csvEscape(row.classifiedLanguage),
          csvEscape(Array.isArray(row.genres) ? row.genres.join("|") : ""),
          csvEscape(row.rtScore ?? ""),
          csvEscape(row.rtUrl ?? ""),
          csvEscape(row.reason ?? ""),
          csvEscape(row.addedToRadarr ? "true" : "false")
        ].join(",")
      )
    ].join("\n") + "\n";
  const toCsv = (rows) =>
    [
      splitHeader,
      ...rows.map((row) =>
        [
          csvEscape(row.title),
          csvEscape(row.year),
          csvEscape(row.classifiedLanguage),
          csvEscape(Array.isArray(row.genres) ? row.genres.join("|") : ""),
          csvEscape(row.rtScore ?? ""),
          csvEscape(row.rtUrl ?? ""),
          csvEscape(row.reason ?? ""),
          csvEscape(row.sourceList ?? ""),
          csvEscape(row.classificationSource ?? ""),
          csvEscape(row.addedToRadarr ? "true" : "false")
        ].join(",")
      )
    ].join("\n") + "\n";

  await writeFile(dataPath("accepted_candidates.csv"), acceptedCsv, "utf8");
  await writeFile(dataPath("english-accepted-candidates.csv"), toCsv(english), "utf8");
  await writeFile(dataPath("foreign-accepted-candidates.csv"), toCsv(foreign), "utf8");
  await writeJson(languageCachePath, languageCache);
  await writeWorkspaceSummary({
    acceptedLanguageBuckets: {
      english: english.length,
      foreign: foreign.length
    }
  });

  console.log(
    JSON.stringify(
      {
        accepted: acceptedRows.length,
        english: english.length,
        foreign: foreign.length
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
