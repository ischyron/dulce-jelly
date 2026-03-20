import { readFile, writeFile } from "node:fs/promises";
import { appendJsonLine, buildKey, parseCsv, readJson, readJsonLines, writeJson } from "../lib/common.mjs";
import { cachePath, dataPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";
const radarrApiKey = process.env.RADARR_API_KEY ?? null;
const radarrBaseUrl = process.env.RADARR_BASE_URL ?? "http://localhost:3273/api/v3";

async function lookupCandidateIds(title, year, lookupCache) {
  const cacheKey = `${String(title).toLowerCase()}|${year}`;
  if (lookupCache[cacheKey]) {
    return lookupCache[cacheKey];
  }

  if (!radarrApiKey) {
    return { tmdbId: null, imdbId: null, title: null, year: null, source: "no_api_key" };
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
    throw new Error(`Radarr lookup failed ${response.status} for ${title} (${year})`);
  }

  const results = await response.json();
  const lowerTitle = String(title).toLowerCase();
  const exact =
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle && item.year === year) ??
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle) ??
    results[0] ??
    null;

  const resolved = {
    tmdbId: exact?.tmdbId ?? null,
    imdbId: exact?.imdbId ?? null,
    title: exact?.title ?? null,
    year: exact?.year ?? null,
    source: exact ? "radarr_lookup" : "lookup_empty"
  };
  lookupCache[cacheKey] = resolved;
  return resolved;
}

async function main() {
  const rawCandidates = parseCsv(await readFile(dataPath("raw_candidates.csv"), "utf8"));
  const blacklistRows = parseCsv(
    await readFile(dataPath("blacklist.csv"), "utf8").catch(() => "title,year,notes\n")
  );
  const ownedPayload = await readJson(dataPath("owned_titles.json"), { items: [] });
  const lookupCache = (await readJson(cachePath("lookup_cache.json"), {})) ?? {};
  const ownedKeys = new Set((ownedPayload.items ?? []).map((item) => item.key));
  const ownedTmdbIds = new Set((ownedPayload.items ?? []).map((item) => item.tmdbId).filter(Boolean));
  const ownedImdbIds = new Set((ownedPayload.items ?? []).map((item) => item.imdbId).filter(Boolean));
  const existingState = await readJsonLines(statePath("candidates.jsonl"));
  const existingKeys = new Set(existingState.map((row) => row.key));
  const blacklistedKeys = new Set(
    blacklistRows.map((row) => buildKey(row.title, row.year)).filter((key) => !key.startsWith("|"))
  );

  let enqueued = 0;
  let skippedOwned = 0;
  let skippedExisting = 0;
  let skippedBlacklisted = 0;

  for (const row of rawCandidates) {
    const year = Number(row.year) || null;
    const title = String(row.title ?? "").trim();
    if (!title || !year) {
      continue;
    }

    const key = buildKey(title, year);
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }

    const lookupIds = await lookupCandidateIds(title, year, lookupCache);
    const matchesOwnedByProvider =
      (lookupIds.tmdbId && ownedTmdbIds.has(String(lookupIds.tmdbId))) ||
      (lookupIds.imdbId && ownedImdbIds.has(String(lookupIds.imdbId)));

    const baseRecord = {
      key,
      title,
      year,
      tmdbId: lookupIds.tmdbId ? String(lookupIds.tmdbId) : null,
      imdbId: lookupIds.imdbId ? String(lookupIds.imdbId) : null,
      lookupTitle: lookupIds.title,
      lookupYear: lookupIds.year,
      sourceList: row.source_list ?? "",
      sourceUrl: row.source_url ?? "",
      notes: row.notes ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (year < 1960) {
      await appendJsonLine(statePath("candidates.jsonl"), {
        ...baseRecord,
        status: "rejected",
        reason: "Pre-1960 title is out of scope"
      });
      existingKeys.add(key);
      continue;
    }

    if (blacklistedKeys.has(key)) {
      await appendJsonLine(statePath("candidates.jsonl"), {
        ...baseRecord,
        status: "rejected",
        reason: "Blacklisted"
      });
      existingKeys.add(key);
      skippedBlacklisted += 1;
      continue;
    }

    if (matchesOwnedByProvider || ownedKeys.has(key)) {
      await appendJsonLine(statePath("candidates.jsonl"), {
        ...baseRecord,
        status: "owned",
        reason: matchesOwnedByProvider
          ? "Already in Jellyfin via provider ID"
          : "Already in Jellyfin via title/year"
      });
      existingKeys.add(key);
      skippedOwned += 1;
      continue;
    }

    await appendJsonLine(statePath("candidates.jsonl"), {
      ...baseRecord,
      status: "pending",
      attempts: 0
    });
    existingKeys.add(key);
    enqueued += 1;
  }

  await writeJson(cachePath("lookup_cache.json"), lookupCache);

  await writeWorkspaceSummary();

  console.log(
    JSON.stringify(
      {
        rawCandidates: rawCandidates.length,
        enqueued,
        skippedBlacklisted,
        skippedOwned,
        skippedExisting
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
