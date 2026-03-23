import { readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { buildKey, csvEscape, parseCsv } from "../lib/common.mjs";
import { dataPath } from "../lib/paths.mjs";
import { parseMetacriticBrowseCards, parseRottenTomatoesBrowseJsonLd } from "../lib/seed-parsers.mjs";
import {
  extractFilmTitleFromTableCell,
  extractTitleFromWikilink,
  extractWinnerTitleFromHighlightedCell,
  stripWikiMarkup
} from "../lib/wiki.mjs";

const execFile = promisify(execFileCallback);

function extractItalicizedTitleCell(line) {
  const candidate = String(line)
    .split("||")
    .map((part) => part.trim())
    .find((part) => part.includes("''") && part.includes("[["));
  return extractTitleFromWikilink(candidate ?? line);
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

async function fetchSeedHtml(url, { preferFlareSolverr = false } = {}) {
  if (!preferFlareSolverr) {
    try {
      return await fetchText(url);
    } catch {}
  }

  try {
    return await fetchViaFlareSolverr(url);
  } catch (error) {
    if (preferFlareSolverr) {
      throw error;
    }
  }

  return fetchText(url);
}

async function importRottenTomatoesBrowseSeeds() {
  const sources = [
    {
      source_list: "rt_browse_movies_at_home_fresh",
      source_url: "https://www.rottentomatoes.com/browse/movies_at_home/critics:fresh~sort:tomatometer_highest",
      notes: "Rotten Tomatoes browse: movies at home sorted by Tomatometer",
      minimumReviewCount: 20
    },
    {
      source_list: "rt_browse_movies_in_theaters_fresh",
      source_url: "https://www.rottentomatoes.com/browse/movies_in_theaters/critics:fresh~sort:tomatometer_highest",
      notes: "Rotten Tomatoes browse: movies in theaters sorted by Tomatometer",
      minimumReviewCount: 20
    }
  ];

  const rows = [];
  for (const source of sources) {
    const html = await fetchSeedHtml(source.source_url);
    const items = parseRottenTomatoesBrowseJsonLd(html, source.minimumReviewCount);
    for (const item of items) {
      if (item.year < 1960) {
        continue;
      }
      rows.push({
        title: item.title,
        year: item.year,
        source_list: source.source_list,
        source_url: source.source_url,
        notes: `${source.notes}; RT ${item.rtScore}; reviews ${item.reviewCount}; ${item.rtUrl}`
      });
    }
  }

  return rows;
}

async function importMetacriticBrowseSeeds() {
  const currentYear = new Date().getUTCFullYear();
  const pages = Array.from({ length: 8 }, (_, index) => index + 1);
  const rows = [];

  for (const page of pages) {
    const sourceUrl = `https://www.metacritic.com/browse/movie/?releaseYearMin=1978&releaseYearMax=${currentYear}&page=${page}`;
    const html = await fetchSeedHtml(sourceUrl, { preferFlareSolverr: true });
    const items = parseMetacriticBrowseCards(html);
    for (const item of items) {
      if (item.year < 1978 || item.year > currentYear) {
        continue;
      }
      rows.push({
        title: item.title,
        year: item.year,
        source_list: "metacritic_browse_1978_plus",
        source_url: sourceUrl,
        notes: `Metacritic browse page ${page}; ${item.sourceUrl}`
      });
    }
  }

  return rows;
}

async function importSightAndSound2022() {
  const url = "https://en.wikipedia.org/wiki/The_Sight_and_Sound_Greatest_Films_of_All_Time_2022?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];

  for (const line of text.split("\n")) {
    if (!line.startsWith("# <li value=")) {
      continue;
    }

    const cells = line.split("||").map((part) => part.trim());
    const titleCell =
      line.includes('style="text-align:center;"') && cells.length > 1 ? cells[1] : cells[0];
    const title = extractTitleFromWikilink(titleCell);
    const preVoteSegment = line.split(") (")[0];
    const yearMatches = [...preVoteSegment.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
    const year = yearMatches.length > 0 ? Number(yearMatches[yearMatches.length - 1][1]) : null;
    if (!title || !year || year < 1960) {
      continue;
    }

    rows.push({
      title,
      year,
      source_list: "sight_sound_2022",
      source_url: url,
      notes: "Sight and Sound 2022 critics/directors top list"
    });
  }

  return rows;
}

async function importBestPictureNominees() {
  const url = "https://en.wikipedia.org/wiki/Academy_Award_for_Best_Picture?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/\|\[\[(?:\d{4} in film\|)?(\d{4})(?:\/\d{2})?\]\]/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (!/^\|\s*(?:''\[\[|'''''[\[]\[)/.test(line)) {
      continue;
    }

    const title = extractItalicizedTitleCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "oscars_best_picture",
      source_url: url,
      notes: "Academy Award for Best Picture winner/nominee"
    });
  }

  return rows;
}

async function importBestInternationalWinners() {
  const url =
    "https://en.wikipedia.org/wiki/Academy_Award_for_Best_International_Feature_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];

  for (const line of text.split("\n")) {
    const match = line.match(/^\*\s*(\d{4}):\s*''\[\[([^|\]]+)\|?([^|\]]*)\]\]''/);
    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    if (year < 1960) {
      continue;
    }

    rows.push({
      title: stripWikiMarkup(match[3] || match[2]),
      year,
      source_list: "oscars_best_international_winners",
      source_url: url,
      notes: "Academy Award for Best International Feature Film winner"
    });
  }

  return rows;
}

async function importPalmeDorWinners() {
  const url = "https://en.wikipedia.org/wiki/Palme_d%27Or?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/!\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\s*\|\s*(?:\[\[[^|\]]+\|)?(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (!/^\|\s*(?:colspan="\d+"\s*\|\s*)?(?:\{\{sort\|[^|]+\|)?''\[\[/.test(line)) {
      continue;
    }

    const title = extractItalicizedTitleCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "palme_dor",
      source_url: url,
      notes: "Palme d'Or winner"
    });
  }

  return rows;
}

async function importGoldenLionWinners() {
  const url = "https://en.wikipedia.org/wiki/Golden_Lion?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/!\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\s*\|\s*(?:\[\[[^|\]]+\|)?(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (!/^\|\s*(?:colspan="\d+"\s*\|\s*)?\{\{sort\|[^|]+\|''\[\[/.test(line)) {
      continue;
    }

    const title = extractItalicizedTitleCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "golden_lion",
      source_url: url,
      notes: "Golden Lion winner"
    });
  }

  return rows;
}

async function importGoldenBearWinners() {
  const url = "https://en.wikipedia.org/wiki/Golden_Bear?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/!\s*(?:rowspan="\d+"\s*)?\[\[[^|\]]+\|(\d{4})\]\]/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (!/^\|\s*(?:colspan="\d+"\s*\|\s*)?\{\{sort\|[^|]+\|''\[\[/.test(line)) {
      continue;
    }

    const cells = line.split("||").map((part) => part.trim());
    const titleCell =
      line.includes('style="text-align:center;"') && cells.length > 1 ? cells[1] : cells[0];
    const title = extractTitleFromWikilink(titleCell);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "golden_bear",
      source_url: url,
      notes: "Golden Bear winner"
    });
  }

  return rows;
}

async function importCannesGrandPrixWinners() {
  const url = "https://en.wikipedia.org/wiki/Grand_Prix_(Cannes_Film_Festival)?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/!\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\s*\|\s*(?:\[\[[^|\]]+\|)?(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (!/^\|\s*(?:colspan="\d+"\s*\|\s*)?\{\{sort\|[^|]+\|''\[\[/.test(line)) {
      continue;
    }

    const cells = line.split("||").map((part) => part.trim());
    const titleCell =
      line.includes('style="text-align:center;"') && cells.length > 1 ? cells[1] : cells[0];
    const title = extractTitleFromWikilink(titleCell);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "cannes_grand_prix",
      source_url: url,
      notes: "Cannes Grand Prix winner"
    });
  }

  return rows;
}

async function importNewYorkFilmCriticsCircleBestFilm() {
  const url =
    "https://en.wikipedia.org/wiki/New_York_Film_Critics_Circle_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/^!\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\s*\|\s*(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
    }

    if (!currentYear || currentYear < 1960 || !line.startsWith("|") || !line.includes("''[[")) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "nyfcc_best_film",
      source_url: url,
      notes: "New York Film Critics Circle Award for Best Film winner"
    });
  }

  return rows;
}

async function importNationalSocietyOfFilmCriticsBestPicture() {
  const url =
    "https://en.wikipedia.org/wiki/National_Society_of_Film_Critics_Award_for_Best_Picture?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/\|style="text-align:center;"\|\s*(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
    }

    if (!currentYear || currentYear < 1960 || !line.startsWith("|") || !line.includes("[[")) {
      continue;
    }

    const cells = line.split("||").map((part) => part.trim());
    const titleCell =
      line.includes('style="text-align:center;"') && cells.length > 1 ? cells[1] : cells[0];
    const title = extractTitleFromWikilink(titleCell);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "nsfc_best_picture",
      source_url: url,
      notes: "National Society of Film Critics Award for Best Picture winner"
    });
  }

  return rows;
}

async function importLosAngelesFilmCriticsBestFilm() {
  const url =
    "https://en.wikipedia.org/wiki/Los_Angeles_Film_Critics_Association_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/^\|\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\|\s*(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
    }

    if (!currentYear || currentYear < 1960 || !line.startsWith("|") || !line.includes("''[[")) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "lafca_best_film",
      source_url: url,
      notes: "Los Angeles Film Critics Association Award for Best Film winner"
    });
  }

  return rows;
}

async function importNationalBoardOfReviewBestFilm() {
  const url = "https://en.wikipedia.org/wiki/National_Board_of_Review_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const fullRowMatch = line.match(/^\|\s*(?:rowspan="\d+"\s*)?style="text-align:center;"\s*\|\s*(\d{4})\s*\|\|\s*''(?:''|)\[\[([^|\]]+)\|?([^|\]]*)\]\]''(?:''|)/);
    if (fullRowMatch) {
      const year = Number(fullRowMatch[1]);
      if (year >= 1960) {
        rows.push({
          title: stripWikiMarkup(fullRowMatch[3] || fullRowMatch[2]),
          year,
          source_list: "national_board_of_review_best_film",
          source_url: url,
          notes: "National Board of Review Award for Best Film winner"
        });
      }
      currentYear = year;
      continue;
    }

    const yearOnlyMatch = line.match(/^\|\s*rowspan="\d+"\s*style="text-align:center;"\s*\|\s*(\d{4})/);
    if (yearOnlyMatch) {
      currentYear = Number(yearOnlyMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    const tiedRowMatch = line.match(/^\|\s*''(?:''|)\[\[([^|\]]+)\|?([^|\]]*)\]\]''(?:''|)/);
    if (!tiedRowMatch) {
      continue;
    }

    rows.push({
      title: stripWikiMarkup(tiedRowMatch[2] || tiedRowMatch[1]),
      year: currentYear,
      source_list: "national_board_of_review_best_film",
      source_url: url,
      notes: "National Board of Review Award for Best Film winner"
    });
  }

  return rows;
}

async function importBaftaBestFilm() {
  const url = "https://en.wikipedia.org/wiki/BAFTA_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/rowspan="\d+"\|\s*\{\{center\|'''(\d{4})'''/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (!currentYear || currentYear < 1960) {
      continue;
    }

    if (
      !/^\|\s*(?:style="background:#FAEB86"\|\s*)?(?:\{\{sort\|[^|]+\|)?''(?:''|)\[\[/.test(line)
    ) {
      continue;
    }

    const title = extractFilmTitleFromTableCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "bafta_best_film",
      source_url: url,
      notes: "BAFTA Best Film winner/nominee"
    });
  }

  return rows;
}

async function importBaftaBestFilmNotInEnglishLanguageWinners() {
  const url =
    "https://en.wikipedia.org/wiki/BAFTA_Award_for_Best_Film_Not_in_the_English_Language?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/\{\{center\|'''(\d{4})'''/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (
      !currentYear ||
      currentYear < 1960 ||
      !/background:#FAEB86/.test(line) ||
      !/''{2,5}\[\[/.test(line)
    ) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "bafta_best_film_not_english_winner",
      source_url: url,
      notes: "BAFTA Award for Best Film Not in the English Language winner"
    });
  }

  return rows;
}

async function importEuropeanFilmAwardBestFilmWinners() {
  const url = "https://en.wikipedia.org/wiki/European_Film_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;
  let capturedYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/rowspan="\d+" align="center"\|\s*'?''?(\d{4})/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      capturedYear = null;
      continue;
    }

    if (!currentYear || currentYear < 1960 || capturedYear === currentYear || !line.startsWith("|")) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "european_film_award_best_film_winner",
      source_url: url,
      notes: "European Film Award for Best Film winner"
    });
    capturedYear = currentYear;
  }

  return rows;
}

async function importIndependentSpiritBestFilmWinners() {
  const url = "https://en.wikipedia.org/wiki/Independent_Spirit_Award_for_Best_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/!\s*rowspan="\d+"\s*style="text-align:center;"\s*\|\s*\[\[[^|\]]+\|(\d{4})\]\]/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (
      !currentYear ||
      currentYear < 1978 ||
      !/background:#B0C4DE/.test(line) ||
      !/''{2,5}\[\[/.test(line)
    ) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "independent_spirit_best_film_winner",
      source_url: url,
      notes: "Independent Spirit Award for Best Film winner"
    });
  }

  return rows;
}

async function importBaftaOutstandingBritishFilmWinners() {
  const url = "https://en.wikipedia.org/wiki/BAFTA_Award_for_Outstanding_British_Film?action=raw";
  const text = await (await fetch(url)).text();
  const rows = [];
  let currentYear = null;

  for (const line of text.split("\n")) {
    const yearMatch = line.match(/\{\{center\|'''(\d{4})'''/);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    if (
      !currentYear ||
      currentYear < 1978 ||
      !/background:#FAEB86/.test(line) ||
      !/''{2,5}\[\[/.test(line)
    ) {
      continue;
    }

    const title = extractWinnerTitleFromHighlightedCell(line);
    if (!title) {
      continue;
    }

    rows.push({
      title,
      year: currentYear,
      source_list: "bafta_outstanding_british_film_winner",
      source_url: url,
      notes: "BAFTA Award for Outstanding British Film winner"
    });
  }

  return rows;
}

async function updateSeedSources() {
  const seedSources = [
    {
      source_name: "rt_browse_movies_at_home_fresh",
      source_url: "https://www.rottentomatoes.com/browse/movies_at_home/critics:fresh~sort:tomatometer_highest",
      notes: "Rotten Tomatoes browse: movies at home sorted by Tomatometer"
    },
    {
      source_name: "rt_browse_movies_in_theaters_fresh",
      source_url:
        "https://www.rottentomatoes.com/browse/movies_in_theaters/critics:fresh~sort:tomatometer_highest",
      notes: "Rotten Tomatoes browse: movies in theaters sorted by Tomatometer"
    },
    {
      source_name: "metacritic_browse_1978_plus",
      source_url: "https://www.metacritic.com/browse/movie/?releaseYearMin=1978",
      notes: "Metacritic browse pages 1-8 for 1978+ movies"
    },
    {
      source_name: "sight_sound_2022",
      source_url:
        "https://en.wikipedia.org/wiki/The_Sight_and_Sound_Greatest_Films_of_All_Time_2022?action=raw",
      notes: "Sight and Sound 2022 critics/directors top list"
    },
    {
      source_name: "oscars_best_picture",
      source_url: "https://en.wikipedia.org/wiki/Academy_Award_for_Best_Picture?action=raw",
      notes: "Academy Award for Best Picture winner/nominee"
    },
    {
      source_name: "oscars_best_international_winners",
      source_url:
        "https://en.wikipedia.org/wiki/Academy_Award_for_Best_International_Feature_Film?action=raw",
      notes: "Academy Award for Best International Feature Film winner"
    },
    {
      source_name: "palme_dor",
      source_url: "https://en.wikipedia.org/wiki/Palme_d%27Or?action=raw",
      notes: "Palme d'Or winner"
    },
    {
      source_name: "golden_lion",
      source_url: "https://en.wikipedia.org/wiki/Golden_Lion?action=raw",
      notes: "Golden Lion winner"
    },
    {
      source_name: "golden_bear",
      source_url: "https://en.wikipedia.org/wiki/Golden_Bear?action=raw",
      notes: "Golden Bear winner"
    },
    {
      source_name: "cannes_grand_prix",
      source_url: "https://en.wikipedia.org/wiki/Grand_Prix_(Cannes_Film_Festival)?action=raw",
      notes: "Cannes Grand Prix winner"
    },
    {
      source_name: "nyfcc_best_film",
      source_url:
        "https://en.wikipedia.org/wiki/New_York_Film_Critics_Circle_Award_for_Best_Film?action=raw",
      notes: "New York Film Critics Circle Award for Best Film winner"
    },
    {
      source_name: "nsfc_best_picture",
      source_url:
        "https://en.wikipedia.org/wiki/National_Society_of_Film_Critics_Award_for_Best_Picture?action=raw",
      notes: "National Society of Film Critics Award for Best Picture winner"
    },
    {
      source_name: "lafca_best_film",
      source_url:
        "https://en.wikipedia.org/wiki/Los_Angeles_Film_Critics_Association_Award_for_Best_Film?action=raw",
      notes: "Los Angeles Film Critics Association Award for Best Film winner"
    },
    {
      source_name: "national_board_of_review_best_film",
      source_url: "https://en.wikipedia.org/wiki/National_Board_of_Review_Award_for_Best_Film?action=raw",
      notes: "National Board of Review Award for Best Film winner"
    },
    {
      source_name: "bafta_best_film_not_english_winner",
      source_url:
        "https://en.wikipedia.org/wiki/BAFTA_Award_for_Best_Film_Not_in_the_English_Language?action=raw",
      notes: "BAFTA Award for Best Film Not in the English Language winner"
    },
    {
      source_name: "european_film_award_best_film_winner",
      source_url: "https://en.wikipedia.org/wiki/European_Film_Award_for_Best_Film?action=raw",
      notes: "European Film Award for Best Film winner"
    },
    {
      source_name: "independent_spirit_best_film_winner",
      source_url: "https://en.wikipedia.org/wiki/Independent_Spirit_Award_for_Best_Film?action=raw",
      notes: "Independent Spirit Award for Best Film winner"
    },
    {
      source_name: "bafta_outstanding_british_film_winner",
      source_url: "https://en.wikipedia.org/wiki/BAFTA_Award_for_Outstanding_British_Film?action=raw",
      notes: "BAFTA Award for Outstanding British Film winner"
    },
    {
      source_name: "bafta_best_film",
      source_url: "https://en.wikipedia.org/wiki/BAFTA_Award_for_Best_Film?action=raw",
      notes: "BAFTA Best Film winner/nominee"
    }
  ];

  const lines = [
    "source_name,source_url,notes",
    ...seedSources.map((row) =>
      [csvEscape(row.source_name), csvEscape(row.source_url), csvEscape(row.notes)].join(",")
    )
  ];
  await writeFile(dataPath("seed_sources.csv"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const existingRaw = parseCsv(await readFile(dataPath("raw_candidates.csv"), "utf8"));
  const existingKeys = new Set(existingRaw.map((row) => buildKey(row.title, row.year)));
  const imported = [
    ...(await importRottenTomatoesBrowseSeeds()),
    ...(await importMetacriticBrowseSeeds()),
    ...(await importSightAndSound2022()),
    ...(await importBestPictureNominees()),
    ...(await importBestInternationalWinners()),
    ...(await importPalmeDorWinners()),
    ...(await importGoldenLionWinners()),
    ...(await importGoldenBearWinners()),
    ...(await importCannesGrandPrixWinners()),
    ...(await importNewYorkFilmCriticsCircleBestFilm()),
    ...(await importNationalSocietyOfFilmCriticsBestPicture()),
    ...(await importLosAngelesFilmCriticsBestFilm()),
    ...(await importNationalBoardOfReviewBestFilm()),
    ...(await importBaftaBestFilmNotInEnglishLanguageWinners()),
    ...(await importEuropeanFilmAwardBestFilmWinners()),
    ...(await importIndependentSpiritBestFilmWinners()),
    ...(await importBaftaOutstandingBritishFilmWinners()),
    ...(await importBaftaBestFilm())
  ];

  const merged = [...existingRaw];
  let added = 0;

  for (const row of imported) {
    const key = buildKey(row.title, row.year);
    if (existingKeys.has(key)) {
      continue;
    }
    existingKeys.add(key);
    merged.push(row);
    added += 1;
  }

  const csvLines = [
    "title,year,source_list,source_url,notes",
    ...merged.map((row) =>
      [
        csvEscape(row.title),
        csvEscape(row.year),
        csvEscape(row.source_list),
        csvEscape(row.source_url),
        csvEscape(row.notes)
      ].join(",")
    )
  ];

  await writeFile(dataPath("raw_candidates.csv"), `${csvLines.join("\n")}\n`, "utf8");
  await updateSeedSources();
  console.log(JSON.stringify({ imported: imported.length, added, total: merged.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
