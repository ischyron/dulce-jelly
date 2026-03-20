import { appendFile, readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { buildKey, csvEscape, normalizeTitle, readJson, readJsonLines, writeJson } from "../lib/common.mjs";
import { dataPath, logsPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";

const execFile = promisify(execFileCallback);
const batchSize = Number(process.argv[2] ?? process.env.BATCH_SIZE ?? 10);

function parseYearFromText(text) {
  const match = String(text).match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function slugify(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function scoreThresholdFor(criteria, year, language, genres) {
  const normalizedLanguage = String(language ?? "").toLowerCase();
  const isEnglish = !normalizedLanguage || normalizedLanguage === "english" || normalizedLanguage === "en";
  const isOlder = year >= 1960 && year <= 1989;
  const base = isOlder
    ? isEnglish
      ? criteria.acceptedThresholds.english_1960_1989
      : criteria.acceptedThresholds.non_english_1960_1989
    : isEnglish
      ? criteria.acceptedThresholds.english_1990_plus
      : criteria.acceptedThresholds.non_english_1990_plus;

  const startYear = criteria.saturatedSlices.years[0];
  const endYear = criteria.saturatedSlices.years[1];
  const hasSaturatedGenre = genres.some((genre) => criteria.saturatedSlices.genres.includes(genre));
  if (year >= startYear && year <= endYear && hasSaturatedGenre) {
    return Math.max(base, criteria.saturatedSlices.preferredRtFloor);
  }
  return base;
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

function extractMovieDataFromHtml(html, fallbackTitle, fallbackYear) {
  const ldJson = parseJsonScript(html, /<script type="application\/ld\+json">(.*?)<\/script>/s);
  const mediaScorecard = parseJsonScript(
    html,
    /<script[^>]*media-scorecard-json"[^>]*type="application\/json"[^>]*>\s*(\{.*?\})\s*<\/script>/s
  );
  const titleMatch =
    html.match(/<title>(.*?)\s*-\s*Rotten Tomatoes/i) ??
    html.match(/"title"\s*:\s*"([^"]+)"/i) ??
    html.match(/<meta property="og:title" content="([^"]+)"/i);
  const ratingMatch = html.match(/"tomatometerScoreAll"\s*:\s*\{[^}]*"score"\s*:\s*(\d+)/i);
  const genreMatches = [...html.matchAll(/"genre"\s*:\s*"([^"]+)"/gi)].map((match) => match[1].trim());
  const languageMatches = [
    ...html.matchAll(/"originalLanguage"\s*:\s*"([^"]+)"/gi),
    ...html.matchAll(/"inLanguage"\s*:\s*"([^"]+)"/gi)
  ].map((match) => match[1].trim());
  const runtimeMatch =
    html.match(/"runtime"\s*:\s*"PT(?:(\d+)H)?(?:(\d+)M)?"/i) ??
    html.match(/"duration"\s*:\s*"PT(?:(\d+)H)?(?:(\d+)M)?"/i);

  const title =
    ldJson?.name?.replace(/\s+\|\s+Rotten Tomatoes$/i, "").trim() ??
    titleMatch?.[1]?.replace(/\s+\|\s+Rotten Tomatoes$/i, "").replace(/\s+/g, " ").trim() ??
    fallbackTitle;
  const year =
    parseYearFromText(ldJson?.dateCreated ?? ldJson?.datePublished ?? "") ??
    parseYearFromText(html) ??
    fallbackYear;
  const rtScore = Number(
    mediaScorecard?.criticsScore?.score ??
      mediaScorecard?.criticsScore?.scorePercent?.replace?.("%", "") ??
      ldJson?.aggregateRating?.ratingValue ??
      ratingMatch?.[1] ??
      NaN
  );
  const hours = Number(runtimeMatch?.[1] ?? 0);
  const minutes = Number(runtimeMatch?.[2] ?? 0);
  const runtimeMinutes = runtimeMatch ? hours * 60 + minutes : null;
  const genres =
    Array.isArray(ldJson?.genre) && ldJson.genre.length > 0
      ? ldJson.genre.map((genre) => String(genre).trim())
      : [...new Set(genreMatches)];
  const language = languageMatches[0] ?? "";

  return {
    title,
    year,
    rtScore: Number.isFinite(rtScore) ? rtScore : null,
    genres,
    language,
    runtimeMinutes
  };
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

async function fetchViaFlareSolverr(url) {
  const payload = JSON.stringify({
    cmd: "request.get",
    url,
    maxTimeout: 60000
  });

  const { stdout } = await execFile("docker", [
    "exec",
    "prowlarr",
    "sh",
    "-lc",
    `curl -sS -H "Content-Type: application/json" -d '${payload}' http://flaresolverr:8191/v1`
  ]);

  const parsed = JSON.parse(stdout);
  if (parsed.status !== "ok" || !parsed.solution?.response) {
    throw new Error(`FlareSolverr failed for ${url}`);
  }

  return parsed.solution.response;
}

async function resolveRtPage(record, options = {}) {
  const bingOnly = options.bingOnly === true;
  const guesses = [
    `https://www.rottentomatoes.com/m/${slugify(record.title)}_${record.year}`,
    `https://www.rottentomatoes.com/m/${slugify(record.title)}`
  ];

  if (!bingOnly) {
    for (const url of guesses) {
      try {
        const html = await fetchText(url);
        return { url, html, source: "host" };
      } catch {}
    }
  }

  const bingUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(`site:rottentomatoes.com/m "${record.title}" ${record.year}`)}`;
  const rss = await fetchText(bingUrl);
  const urlMatch = rss.match(/https:\/\/www\.rottentomatoes\.com\/m\/[a-zA-Z0-9_%-]+/);
  if (!urlMatch) {
    throw new Error("No Rotten Tomatoes URL found via Bing RSS");
  }

  const resolvedUrl = urlMatch[0];
  try {
    const html = await fetchText(resolvedUrl);
    return { url: resolvedUrl, html, source: "host" };
  } catch {
    const html = await fetchViaFlareSolverr(resolvedUrl);
    return { url: resolvedUrl, html, source: "flaresolverr" };
  }
}

function applyRules(record, details, criteria) {
  if (!details.year || details.year < criteria.minimumYear) {
    return { accepted: false, reason: "Rejected: pre-1960" };
  }

  if (details.runtimeMinutes && details.runtimeMinutes <= criteria.shortRuntimeMinutesMax) {
    return { accepted: false, reason: "Rejected: short runtime" };
  }

  const genres = details.genres;
  if (genres.some((genre) => criteria.excludedGenres.includes(genre))) {
    return { accepted: false, reason: "Rejected: excluded genre" };
  }

  if (normalizeTitle(details.title) !== normalizeTitle(record.title) || details.year !== record.year) {
    return { accepted: false, reason: "Rejected: RT title/year mismatch" };
  }

  if (details.rtScore == null) {
    return { accepted: false, reason: "Rejected: missing RT score" };
  }

  const threshold = scoreThresholdFor(criteria, details.year, details.language, genres);
  if (details.rtScore < threshold) {
    return {
      accepted: false,
      reason: `Rejected: RT ${details.rtScore} below threshold ${threshold}`
    };
  }

  return {
    accepted: true,
    reason: `Accepted: RT ${details.rtScore} meets threshold ${threshold}`
  };
}

function isExactTitleYearMatch(record, details) {
  return normalizeTitle(details.title) === normalizeTitle(record.title) && details.year === record.year;
}

async function rewriteState(rows) {
  const output = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(statePath("candidates.jsonl"), output ? `${output}\n` : "", "utf8");
}

async function appendAccepted(row, details, reason, rtUrl) {
  await appendFile(
    dataPath("accepted_candidates.csv"),
    [
      csvEscape(row.title),
      csvEscape(row.year),
      csvEscape(details.language),
      csvEscape(details.genres.join("|")),
      csvEscape(details.rtScore),
      csvEscape(rtUrl),
      csvEscape(reason)
    ].join(",") + "\n",
    "utf8"
  );
}

async function appendRejected(row, details, reason) {
  await appendFile(
    dataPath("rejected_candidates.csv"),
    [
      csvEscape(row.title),
      csvEscape(row.year),
      csvEscape(details.language ?? ""),
      csvEscape((details.genres ?? []).join("|")),
      csvEscape(details.rtScore ?? ""),
      csvEscape(reason)
    ].join(",") + "\n",
    "utf8"
  );
}

async function main() {
  const criteria = await readJson(dataPath("criteria.json"), {});
  const stateRows = await readJsonLines(statePath("candidates.jsonl"));
  const pendingRows = stateRows.filter((row) => row.status === "pending").slice(0, batchSize);

  if (pendingRows.length === 0) {
    console.log("No pending candidates");
    await writeWorkspaceSummary();
    return;
  }

  const rowMap = new Map(stateRows.map((row) => [row.key, row]));
  const processed = [];

  for (const row of pendingRows) {
    const liveRow = rowMap.get(row.key);
    liveRow.attempts = Number(liveRow.attempts ?? 0) + 1;
    liveRow.updatedAt = new Date().toISOString();

    try {
      let resolved = await resolveRtPage(liveRow);
      let details = extractMovieDataFromHtml(resolved.html, liveRow.title, liveRow.year);

      if (!isExactTitleYearMatch(liveRow, details) && resolved.source !== "bing" && resolved.source !== "flaresolverr") {
        try {
          const fallbackResolved = await resolveRtPage(liveRow, { bingOnly: true });
          const fallbackDetails = extractMovieDataFromHtml(
            fallbackResolved.html,
            liveRow.title,
            liveRow.year
          );
          if (isExactTitleYearMatch(liveRow, fallbackDetails)) {
            resolved = fallbackResolved;
            details = fallbackDetails;
          }
        } catch {}
      }

      const decision = applyRules(liveRow, details, criteria);

      liveRow.rtUrl = resolved.url;
      liveRow.rtSource = resolved.source;
      liveRow.rtScore = details.rtScore;
      liveRow.language = details.language;
      liveRow.genres = details.genres;
      liveRow.runtimeMinutes = details.runtimeMinutes;
      liveRow.reason = decision.reason;
      liveRow.status = decision.accepted ? "accepted" : "rejected";

      if (decision.accepted) {
        await appendAccepted(liveRow, details, decision.reason, resolved.url);
      } else {
        await appendRejected(liveRow, details, decision.reason);
      }

      processed.push({ key: liveRow.key, status: liveRow.status, reason: liveRow.reason });
    } catch (error) {
      liveRow.status = "failed";
      liveRow.reason = error.message;
      await appendFile(
        logsPath("failures.log"),
        `${liveRow.key}\t${error.message}\n`,
        "utf8"
      );
      processed.push({ key: liveRow.key, status: liveRow.status, reason: liveRow.reason });
    }

    await rewriteState([...rowMap.values()]);
  }

  await writeWorkspaceSummary();
  console.log(JSON.stringify({ processed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
