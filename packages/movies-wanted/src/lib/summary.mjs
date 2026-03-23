import { readFile } from "node:fs/promises";
import { parseCsv, readJson, readJsonLines, writeJson } from "./common.mjs";
import { dataPath, reportsPath, statePath } from "./paths.mjs";

export async function writeWorkspaceSummary(extra = {}) {
  const summary = (await readJson(reportsPath("summary.json"), {})) ?? {};
  const rawCandidates = parseCsv(await readFile(dataPath("raw_candidates.csv"), "utf8").catch(() => ""));
  const stateRows = await readJsonLines(statePath("candidates.jsonl"));
  const ownedPayload = (await readJson(dataPath("owned_titles.json"), { items: [] })) ?? { items: [] };
  const acceptedRows = stateRows.filter((row) => row.status === "accepted").length;
  const rejectedRows = stateRows.filter((row) => row.status === "rejected").length;
  const failedRows = stateRows.filter((row) => row.status === "failed").length;
  const ownedRows = stateRows.filter((row) => row.status === "owned").length;
  const pendingRows = stateRows.filter((row) => row.status === "pending").length;

  await writeJson(reportsPath("summary.json"), {
    ...summary,
    generatedAt: new Date().toISOString(),
    workspaceReady: true,
    ownedTitlesCount: ownedPayload.count ?? ownedPayload.items?.length ?? 0,
    candidateRows: rawCandidates.length,
    stateRows: stateRows.length,
    acceptedRows,
    rejectedRows,
    failedRows,
    ownedRows,
    pendingRows,
    estimatedStorageGiB: {
      moderate: Number((acceptedRows * 13.17).toFixed(2)),
      conservative: Number((acceptedRows * 15.36).toFixed(2))
    },
    ...extra
  });
}
