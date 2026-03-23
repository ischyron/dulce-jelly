import { writeFile } from "node:fs/promises";
import { buildKey, readJson, readJsonLines } from "../lib/common.mjs";
import { dataPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";
const radarrApiKey = process.env.RADARR_API_KEY ?? null;
const radarrBaseUrl = process.env.RADARR_BASE_URL ?? "http://localhost:3273/api/v3";

async function lookupCandidateIds(title, year) {
  if (!radarrApiKey) {
    return { tmdbId: null, imdbId: null };
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
    return { tmdbId: null, imdbId: null };
  }

  const results = await response.json();
  const lowerTitle = String(title).toLowerCase();
  const exact =
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle && item.year === year) ??
    results.find((item) => item.title && item.title.toLowerCase() === lowerTitle) ??
    results[0] ??
    null;

  return {
    tmdbId: exact?.tmdbId ? String(exact.tmdbId) : null,
    imdbId: exact?.imdbId ? String(exact.imdbId) : null
  };
}

async function main() {
  const ownedPayload = await readJson(dataPath("owned_titles.json"), { items: [] });
  const stateRows = await readJsonLines(statePath("candidates.jsonl"));
  const ownedKeys = new Set((ownedPayload.items ?? []).map((item) => item.key));
  const ownedTmdbIds = new Set((ownedPayload.items ?? []).map((item) => item.tmdbId).filter(Boolean));
  const ownedImdbIds = new Set((ownedPayload.items ?? []).map((item) => item.imdbId).filter(Boolean));

  let converted = 0;

  for (const row of stateRows) {
    if (row.status !== "accepted") {
      continue;
    }

    if (!row.tmdbId && !row.imdbId) {
      const resolved = await lookupCandidateIds(row.title, row.year);
      if (resolved.tmdbId) {
        row.tmdbId = resolved.tmdbId;
      }
      if (resolved.imdbId) {
        row.imdbId = resolved.imdbId;
      }
    }

    const matchesOwned =
      (row.tmdbId && ownedTmdbIds.has(String(row.tmdbId))) ||
      (row.imdbId && ownedImdbIds.has(String(row.imdbId))) ||
      ownedKeys.has(buildKey(row.title, row.year));

    if (!matchesOwned) {
      continue;
    }

    row.status = "owned";
    row.updatedAt = new Date().toISOString();
    row.reason = "Already in Jellyfin via reconciliation";
    converted += 1;
  }

  await writeFile(
    statePath("candidates.jsonl"),
    stateRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8"
  );
  await writeWorkspaceSummary();

  console.log(JSON.stringify({ converted }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
