import { mkdir, access, writeFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { cacheDir, dataDir, logsDir, reportsDir, stateDir, cachePath, dataPath, logsPath, packageRoot, reportsPath, statePath } from "../lib/paths.mjs";
import { writeWorkspaceSummary } from "../lib/summary.mjs";

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function ensureFile(filePath, contents) {
  try {
    await access(filePath, constants.F_OK);
  } catch {
    await writeFile(filePath, contents, "utf8");
  }
}

async function main() {
  await ensureDir(dataDir);
  await ensureDir(cacheDir);
  await ensureDir(logsDir);
  await ensureDir(reportsDir);
  await ensureDir(stateDir);

  await ensureFile(dataPath("raw_candidates.csv"), "title,year,source_list,source_url,notes\n");
  await ensureFile(statePath("candidates.jsonl"), "");
  await ensureFile(dataPath("english-accepted-candidates.csv"), "title,year,language,genres,rt_score,rt_url,reason,source_list,classification_source,added_to_radarr\n");
  await ensureFile(dataPath("foreign-accepted-candidates.csv"), "title,year,language,genres,rt_score,rt_url,reason,source_list,classification_source,added_to_radarr,rt_review_count\n");
  await ensureFile(dataPath("rejected_candidates.csv"), "title,year,language,genres,rt_score,reason\n");
  await ensureFile(dataPath("blacklist.csv"), "title,year,notes\n");
  await ensureFile(logsPath("failures.log"), "# title|year failures\n");
  await ensureFile(cachePath("lookup_cache.json"), "{}\n");
  await ensureFile(cachePath("accepted_language_cache.json"), "{}\n");
  await ensureFile(cachePath("foreign_review_count_cache.json"), "{}\n");
  await ensureFile(dataPath("seed_sources.csv"), "source_name,source_url,notes\n");

  await writeWorkspaceSummary({
    notes: [
      "Populate raw_candidates.csv before adding RT verification.",
      "Do not rebuild state from scratch once candidate verification begins."
    ]
  });

  console.log(`Initialized movies-wanted workspace at ${packageRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
