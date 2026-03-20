#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { statePath } from "./lib/paths.mjs";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(cliDir, "commands");

function commandFile(name) {
  return path.join(commandsDir, `${name}.mjs`);
}

async function runNodeScript(name, args = []) {
  const script = commandFile(name);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${name} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function pendingCount() {
  try {
    const raw = await readFile(statePath("candidates.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => row.status === "pending").length;
  } catch {
    return 0;
  }
}

async function runLoop(batchSize, delaySeconds, maxBatches) {
  let batch = 0;

  while (batch < maxBatches) {
    const pending = await pendingCount();
    if (pending <= 0) {
      console.log("No pending candidates remain.");
      return;
    }

    batch += 1;
    console.log(`Batch ${batch}: processing up to ${batchSize} candidates (${pending} pending)`);
    await runNodeScript("verify-rt-batch", [String(batchSize)]);
    const remaining = await pendingCount();
    console.log(`Batch ${batch} complete (${remaining} pending remain)`);
    if (remaining <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }

  console.log(`Stopped after MAX_BATCHES=${maxBatches}`);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);

  switch (command) {
    case "help":
      console.log(
        [
          "movies-wanted commands:",
          "  init",
          "  export-owned",
          "  import-seeds",
          "  queue",
          "  verify-batch [size]",
          "  run [batchSize] [delaySeconds] [maxBatches]",
          "  reconcile-owned",
          "  apply-blacklist",
          "  refresh-exports",
          "  review-counts",
          "  add-to-radarr [bucket] [minYear] [snapshotPath]",
          "  refresh",
          "  update"
        ].join("\n")
      );
      return;
    case "init":
      return runNodeScript("init-workspace");
    case "export-owned":
      return runNodeScript("export-owned-titles");
    case "import-seeds":
      return runNodeScript("import-seed-sources");
    case "queue":
      return runNodeScript("queue-candidates");
    case "verify-batch":
      return runNodeScript("verify-rt-batch", args);
    case "run":
      return runLoop(Number(args[0] ?? 10), Number(args[1] ?? 10), Number(args[2] ?? 1000));
    case "reconcile-owned":
      return runNodeScript("reconcile-accepted-with-owned");
    case "apply-blacklist":
      return runNodeScript("apply-blacklist");
    case "refresh-exports":
      return runNodeScript("refresh-accepted-exports");
    case "review-counts":
      return runNodeScript("populate-foreign-review-counts");
    case "add-to-radarr":
      return runNodeScript("add-accepted-to-radarr", args);
    case "refresh":
      await runNodeScript("reconcile-accepted-with-owned");
      await runNodeScript("apply-blacklist");
      await runNodeScript("refresh-accepted-exports");
      await runNodeScript("populate-foreign-review-counts");
      return;
    case "update":
      await runNodeScript("export-owned-titles");
      await runNodeScript("import-seed-sources");
      await runNodeScript("queue-candidates");
      await runLoop(Number(args[0] ?? 10), Number(args[1] ?? 10), Number(args[2] ?? 1000));
      await runNodeScript("reconcile-accepted-with-owned");
      await runNodeScript("apply-blacklist");
      await runNodeScript("refresh-accepted-exports");
      await runNodeScript("populate-foreign-review-counts");
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
