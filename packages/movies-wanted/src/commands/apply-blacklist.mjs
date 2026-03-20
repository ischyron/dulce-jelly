import { readFile, writeFile } from "node:fs/promises";
import { buildKey, parseCsv, readJsonLines } from "../lib/common.mjs";
import { dataPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

async function rewriteAcceptedCsv(stateRows) {
  const lines = [
    "title,year,language,genres,rt_score,rt_url,reason",
    ...stateRows
      .filter((row) => row.status === "accepted")
      .map((row) =>
        [
          csvEscape(row.title),
          csvEscape(row.year),
          csvEscape(row.language ?? ""),
          csvEscape(Array.isArray(row.genres) ? row.genres.join("|") : ""),
          csvEscape(row.rtScore ?? ""),
          csvEscape(row.rtUrl ?? ""),
          csvEscape(row.reason ?? "")
        ].join(",")
      )
  ];

  await writeFile(dataPath("accepted_candidates.csv"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const blacklistRows = parseCsv(await readFile(dataPath("blacklist.csv"), "utf8"));
  const blacklistedKeys = new Set(
    blacklistRows.map((row) => buildKey(row.title, row.year)).filter((key) => !key.startsWith("|"))
  );
  const stateRows = await readJsonLines(statePath("candidates.jsonl"));
  let converted = 0;

  for (const row of stateRows) {
    if (row.status !== "accepted") {
      continue;
    }
    if (!blacklistedKeys.has(buildKey(row.title, row.year))) {
      continue;
    }

    row.status = "rejected";
    row.reason = "Blacklisted";
    row.updatedAt = new Date().toISOString();
    converted += 1;
  }

  await writeFile(
    statePath("candidates.jsonl"),
    stateRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8"
  );
  await rewriteAcceptedCsv(stateRows);
  await writeWorkspaceSummary();

  console.log(JSON.stringify({ converted }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
