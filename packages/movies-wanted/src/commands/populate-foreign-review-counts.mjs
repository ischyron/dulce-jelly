import { readFile, writeFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/common.mjs";
import { cachePath, dataPath } from "../lib/paths.mjs";

const csvPath = dataPath("foreign-accepted-candidates.csv");
const reviewCountCachePath = cachePath("foreign_review_count_cache.json");

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseCsvLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cols.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cols.push(current);
  return cols;
}

function parseJsonScript(html, pattern) {
  const match = html.match(pattern);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function extractReviewCount(html) {
  const mediaScorecard = parseJsonScript(
    html,
    /<script[^>]*media-scorecard-json"[^>]*type="application\/json"[^>]*>\s*(\{.*?\})\s*<\/script>/s
  );
  const ldJson = parseJsonScript(html, /<script type="application\/ld\+json">(.*?)<\/script>/s);

  const scorecardCount =
    mediaScorecard?.criticsScore?.reviewCount ??
    mediaScorecard?.modal?.tomatometerScoreAll?.reviewCount ??
    null;
  if (Number.isFinite(Number(scorecardCount))) {
    return Number(scorecardCount);
  }

  const ldCount = ldJson?.aggregateRating?.reviewCount ?? null;
  if (Number.isFinite(Number(ldCount))) {
    return Number(ldCount);
  }

  const inlineTomatometer =
    html.match(/"title":"Tomatometer","ratingCount":\d+,"ratingValue":"?\d+"?,"reviewCount":(\d+)/i) ??
    html.match(/"reviewCount":(\d+),"score":"\d+","scoreType":"ALL"/i) ??
    html.match(/"scoreType":"ALL".{0,120}?"reviewCount":(\d+)/i);

  if (inlineTomatometer?.[1]) {
    return Number(inlineTomatometer[1]);
  }

  return null;
}

async function main() {
  const raw = await readFile(csvPath, "utf8");
  const rows = raw.trim().split("\n");
  const header = parseCsvLine(rows[0]);
  const dataRows = rows.slice(1).map(parseCsvLine);
  const cache = (await readJson(reviewCountCachePath, {})) ?? {};
  const outputHeader = header.includes("rt_review_count") ? header : [...header, "rt_review_count"];
  let updated = 0;

  for (const row of dataRows) {
    const title = row[0];
    const year = row[1];
    const rtUrl = row[5];
    const cacheKey = `${title.toLowerCase()}|${year}`;
    let reviewCount = cache[cacheKey] ?? null;

    if (reviewCount == null && rtUrl) {
      try {
        const html = await fetchText(rtUrl);
        reviewCount = extractReviewCount(html);
        cache[cacheKey] = reviewCount;
        updated += 1;
      } catch {
        cache[cacheKey] = null;
      }
    }

    if (row.length === outputHeader.length) {
      row[outputHeader.length - 1] = reviewCount ?? "";
    } else {
      row.push(reviewCount ?? "");
    }
  }

  const output = [
    outputHeader.map(csvEscape).join(","),
    ...dataRows.map((row) => row.map(csvEscape).join(","))
  ];

  await writeFile(csvPath, `${output.join("\n")}\n`, "utf8");
  await writeJson(reviewCountCachePath, cache);

  console.log(JSON.stringify({ rows: dataRows.length, fetched: updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
