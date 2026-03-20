import { writeFile } from "node:fs/promises";
import { dataPath } from "../lib/paths.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeTitle(input) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+\(\d{4}\)\s*$/, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: {
      "X-Emby-Token": token
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }

  return response.json();
}

async function main() {
  const token =
    process.env.JELLFIN_SERVICE_AGENT_API_KEY ??
    process.env.JELLYFIN_SERVICE_AGENT_API_KEY;

  if (!token) {
    throw new Error(
      "Missing Jellyfin API token. Expected JELLFIN_SERVICE_AGENT_API_KEY or JELLYFIN_SERVICE_AGENT_API_KEY."
    );
  }

  const baseUrl = process.env.JELLYFIN_BASE_URL ?? "http://localhost:3278";

  const libraries = await getJson(`${baseUrl}/Library/VirtualFolders`, token);
  const moviesLibrary = libraries.find((entry) => entry.CollectionType === "movies");
  if (!moviesLibrary?.ItemId) {
    throw new Error("Could not find Jellyfin movies library");
  }

  const users = await getJson(`${baseUrl}/Users`, token);
  const activeUser = users.find((entry) => entry.Policy?.IsDisabled !== true) ?? users[0];
  if (!activeUser?.Id) {
    throw new Error("Could not find a usable Jellyfin user");
  }

  const itemsUrl = new URL(`${baseUrl}/Users/${activeUser.Id}/Items`);
  itemsUrl.searchParams.set("ParentId", moviesLibrary.ItemId);
  itemsUrl.searchParams.set("Recursive", "true");
  itemsUrl.searchParams.set("IncludeItemTypes", "Movie");
  itemsUrl.searchParams.set("Fields", "OriginalTitle,ProductionYear,ProviderIds");
  itemsUrl.searchParams.set("Limit", "50000");

  const itemsPayload = await getJson(itemsUrl.toString(), token);
  const items = Array.isArray(itemsPayload.Items) ? itemsPayload.Items : [];

  const normalized = items
    .map((item) => {
      const year = Number(item.ProductionYear) || null;
      const title = item.Name ?? item.OriginalTitle ?? "";
      const normalizedTitle = normalizeTitle(title);
      return {
        title,
        year,
        normalizedTitle,
        key: year ? `${normalizedTitle}|${year}` : `${normalizedTitle}|unknown`,
        jellyfinId: item.Id ?? null,
        tmdbId: item.ProviderIds?.Tmdb ?? null,
        imdbId: item.ProviderIds?.Imdb ?? null
      };
    })
    .filter((entry) => entry.title && entry.year)
    .sort((a, b) => a.key.localeCompare(b.key));

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    libraryId: moviesLibrary.ItemId,
    userId: activeUser.Id,
    count: normalized.length,
    items: normalized
  };

  const csvLines = [
    "title,year,normalized_title,key,jellyfin_id,tmdb_id,imdb_id",
    ...normalized.map((entry) =>
      [
        csvEscape(entry.title),
        csvEscape(entry.year),
        csvEscape(entry.normalizedTitle),
        csvEscape(entry.key),
        csvEscape(entry.jellyfinId),
        csvEscape(entry.tmdbId),
        csvEscape(entry.imdbId)
      ].join(",")
    )
  ];

  await writeFile(dataPath("owned_titles.json"), `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8");
  await writeFile(dataPath("owned_titles.csv"), `${csvLines.join("\n")}\n`, "utf8");

  console.log(`Exported ${normalized.length} owned Jellyfin movie titles`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
