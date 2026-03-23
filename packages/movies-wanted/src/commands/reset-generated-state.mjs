import { writeFile } from "node:fs/promises";
import { dataPath, logsPath, packageRoot, statePath } from "../lib/paths.mjs";

async function main() {
  await writeFile(dataPath("raw_candidates.csv"), "title,year,source_list,source_url,notes\n", "utf8");
  await writeFile(dataPath("english-accepted-candidates.csv"), "title,year,language,genres,rt_score,rt_url,reason,source_list,classification_source,added_to_radarr\n", "utf8");
  await writeFile(dataPath("foreign-accepted-candidates.csv"), "title,year,language,genres,rt_score,rt_url,reason,source_list,classification_source,added_to_radarr,rt_review_count\n", "utf8");
  await writeFile(dataPath("rejected_candidates.csv"), "title,year,language,genres,rt_score,reason\n", "utf8");
  await writeFile(statePath("candidates.jsonl"), "", "utf8");
  await writeFile(logsPath("failures.log"), "# title|year failures\n", "utf8");
  console.log(`Reset generated workspace state at ${packageRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
