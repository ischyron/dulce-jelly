import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { parseLibraryRootsUnknown, stringifyLibraryRoots } from './libraryRoots.js';

export interface RuntimeConfig {
  host: string;
  port: number;
  curatarrDataPath: string;
  configPath: string;
  dbPath: string;
  settings: Record<string, string>;
}

type PlainObject = Record<string, unknown>;

interface ConfigDoc {
  server?: PlainObject;
  paths?: PlainObject;
  settings?: PlainObject;
}

interface SecretsDoc {
  jellyfin?: { apiKey?: unknown };
  prowlarr?: { apiKey?: unknown };
  llm?: { provider?: unknown; apiKey?: unknown };
}

export interface ApplySettingsResult {
  total: number;
  changed: number;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return undefined;
}

function resolveRelative(baseDir: string, maybePath: string | undefined): string | undefined {
  if (!maybePath) return undefined;
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(baseDir, maybePath);
}

function readYamlFile(filePath: string): PlainObject {
  try {
    if (!fs.existsSync(filePath)) return {};
    return (YAML.parse(fs.readFileSync(filePath, 'utf8')) ?? {}) as PlainObject;
  } catch {
    return {};
  }
}

function configSearchPaths(file: string): string[] {
  const cwd = process.cwd();
  return [
    path.resolve('/config', file),
    path.resolve(cwd, 'config', file),
    path.resolve(cwd, 'data', 'curatarr', 'config', file),
  ];
}

function firstExistingPath(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

function resolveConfigPath(): string {
  return firstExistingPath(configSearchPaths('config.yaml'));
}

function resolveSecretsPath(): string {
  return firstExistingPath(configSearchPaths('secrets.yaml'));
}

function extractSettings(raw: PlainObject): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'libraryRoots') {
      const roots = parseLibraryRootsUnknown(value);
      if (roots.length > 0) out.libraryRoots = stringifyLibraryRoots(roots);
      continue;
    }
    const scalar = str(value);
    if (scalar != null) out[key] = scalar;
  }
  return out;
}

function extractSecretsSettings(raw: PlainObject): Record<string, string> {
  const parsed = raw as SecretsDoc;
  const out: Record<string, string> = {};

  const jfApiKey = str(parsed.jellyfin?.apiKey);
  if (jfApiKey) out.jellyfinApiKey = jfApiKey;

  const prowlarrApiKey = str(parsed.prowlarr?.apiKey);
  if (prowlarrApiKey) out.prowlarrApiKey = prowlarrApiKey;

  const llmProvider = str(parsed.llm?.provider);
  if (llmProvider) out.llmProvider = llmProvider;

  const llmApiKey = str(parsed.llm?.apiKey);
  if (llmApiKey) out.llmApiKey = llmApiKey;

  return out;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const configPath = resolveConfigPath();
  const configDir = path.dirname(configPath);

  const parsed = readYamlFile(configPath) as ConfigDoc;
  const server = (parsed.server ?? {}) as PlainObject;
  const paths = (parsed.paths ?? {}) as PlainObject;
  const rawSettings = (parsed.settings ?? {}) as PlainObject;

  const curatarrDataPath =
    resolveRelative(configDir, str(paths.curatarrDataPath)) ?? path.resolve(process.cwd(), 'data', 'curatarr');

  const host = str(server.host) ?? '0.0.0.0';
  const port = Number(str(server.port) ?? '7474');

  const dbPath = resolveRelative(configDir, str(paths.dbPath)) ?? path.resolve(curatarrDataPath, 'db', 'curatarr.db');

  const settingsFromConfig = extractSettings(rawSettings);
  const settingsFromSecrets = extractSecretsSettings(readYamlFile(resolveSecretsPath()));

  return {
    host,
    port: Number.isFinite(port) ? port : 7474,
    curatarrDataPath,
    configPath,
    dbPath,
    settings: {
      ...settingsFromConfig,
      // secrets override config for sensitive fields
      ...settingsFromSecrets,
    },
  };
}

export function applyRuntimeSettingsToDb(
  getSetting: (key: string) => string | undefined,
  setSetting: (key: string, value: string) => void,
  settings: Record<string, string>,
): ApplySettingsResult {
  let total = 0;
  let changed = 0;

  for (const [k, v] of Object.entries(settings)) {
    total++;
    if ((getSetting(k) ?? '') === v) continue;
    setSetting(k, v);
    changed++;
  }

  return { total, changed };
}

export function ensureRuntimePaths(cfg: RuntimeConfig): void {
  fs.mkdirSync(path.dirname(cfg.configPath), { recursive: true });
  fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
}
