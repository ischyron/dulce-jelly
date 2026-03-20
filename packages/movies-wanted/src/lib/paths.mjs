import path from "node:path";
import { fileURLToPath } from "node:url";

const libDir = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(libDir, "../..");
export const dataDir = path.join(packageRoot, "data");
export const cacheDir = path.join(packageRoot, "cache");
export const stateDir = path.join(packageRoot, "state");
export const reportsDir = path.join(packageRoot, "reports");
export const logsDir = path.join(packageRoot, "logs");
export const docsDir = path.join(packageRoot, "docs");

export function dataPath(...parts) {
  return path.join(dataDir, ...parts);
}

export function cachePath(...parts) {
  return path.join(cacheDir, ...parts);
}

export function statePath(...parts) {
  return path.join(stateDir, ...parts);
}

export function reportsPath(...parts) {
  return path.join(reportsDir, ...parts);
}

export function logsPath(...parts) {
  return path.join(logsDir, ...parts);
}

export function docsPath(...parts) {
  return path.join(docsDir, ...parts);
}
