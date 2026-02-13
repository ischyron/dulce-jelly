#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import { runCompose, CommandResult } from './lib/docker';
import * as envLib from './lib/env';
import { green, red, yellow, dim, cyan, stripAnsi } from './lib/colors';
import { resolveServiceLoose, parseComposeJson, formatPorts, colorLogLine, ComposeRow } from './lib/utils';
import { printHelp } from './lib/help';
import * as cmd from './lib/commands';

const baseDir = path.join(__dirname, '..', '..', '..');

interface HealthEntry {
  name: string;
  state: string;
  health: string;
  uptime: string | number;
  ports: string;
}

interface RecyclarrSyncInfo {
  display: string;
}

interface MountCheckResult {
  ok: boolean;
}

type CommandFunction = (args?: string[]) => number | void | Promise<number | void>;

const commands: Record<string, CommandFunction> = {
  help: () => printHelp(),
  up: (args) => cmd.up(args || []),
  down: () => cmd.down(),
  status: () => cmd.status(),
  start: (args) => { ensureArg(args && args.length, 'start <service>'); return cmd.start(args || []); },
  logs: (args) => cmd.logs(args || []),
  stop: (args) => { ensureArg(args && args.length, 'stop <service>'); return cmd.stop(args || []); },
  restart: (args) => { const svc = resolveServiceLoose((args || [])[0]); ensureArg(svc, 'restart <service>'); return cmd.restart([svc]); },
  reload: (args) => { const target = (args || [])[0]; ensureArg(target, 'reload <caddy|tunnel>'); return cmd.reload([target]); },
  sync: () => cmd.sync(),
  'qb-run': (args) => cmd.qualityBrokerRun(args || []),
  'qb-log': () => cmd.qualityBrokerLogs(),
  test: () => cmd.testCmd(baseDir),
  env: () => {
    const env = envLib.loadEnv(baseDir);
    const keys = [
      'TZ', 'PUID', 'PGID', 'UMASK_SET', 'BASIC_AUTH_USER', 'BASIC_AUTH_HASH', 'CADDY_AUTH_ENABLED',
      'JELLYFIN_AUTH_ENABLED', 'JELLYFIN_MOVIES', 'JELLYFIN_SERIES', 'DOWNLOADS_ROOT', 'INCOMPLETE_ROOT',
      'QBITTORRENT_WATCH', 'RECYCLARR_CRON'
    ];
    keys.forEach((k) => {
      if (env[k] !== undefined) {
        console.log(`${k}=${env[k]}`);
      }
    });
    return 0;
  },
  ports: () => {
    const env = envLib.loadEnv(baseDir);
    const d = (key: string, fallback: string) => env[key] || fallback;
    const ports: Record<string, string> = {
      caddy: d('CADDY_HTTP_PORT', '80'),
      caddy_tls: d('CADDY_HTTPS_PORT', '443'),
      jellyfin: d('JELLYFIN_HTTP_PORT', '3278'),
      jellyfin_tls: d('JELLYFIN_HTTPS_PORT', '3279'),
      jellyseerr: d('JELLYSEERR_PORT', '3277'),
      qbittorrent: d('QBITTORRENT_WEB_PORT', '3275'),
      prowlarr: d('PROWLARR_PORT', '3276'),
      sabnzbd: d('SABNZBD_PORT', '3274'),
      radarr: d('RADARR_PORT', '3273'),
      sonarr: d('SONARR_PORT', '3272'),
      huntarr: d('HUNTARR_PORT', '9705'),
      qb_peer: d('QBITTORRENT_PEER_PORT', '6881'),
    };
    Object.entries(ports).forEach(([k, v]) => console.log(`${k}: ${v}`));
    return 0;
  },
  mounts: () => {
    const result = checkMounts();
    return result.ok ? 0 : 1;
  },
  doctor: () => runDoctor(),
  health: () => {
    const entries = getHealthEntries();
    if (!entries) return 1;
    printHealthTable(entries);
    return 0;
  }
};

function formatHealth(val: string | undefined): string {
  const v = (val || '').toString();
  if (!v || v.toLowerCase() === 'n/a') return dim('n/a');
  if (v.toLowerCase() === 'healthy') return green('healthy');
  return red(v);
}

function getHealthEntries(): HealthEntry[] | null {
  const res = runCompose(['ps', '--format', 'json'], { capture: true }) as CommandResult;
  const qbRes = runCompose(['--profile', 'quality-broker', 'ps', '--format', 'json'], { capture: true }) as CommandResult;
  if (res.code !== 0 && qbRes.code !== 0) return null;
  const rows = (parseComposeJson(res.stdout) || []).concat(parseComposeJson(qbRes.stdout) || []);
  if (!rows || rows.length === 0) {
    console.error('Failed to parse compose ps output');
    return null;
  }
  const seen = new Set<string>();
  const syncInfo = getRecyclarrLastSync();
  return rows
    .filter((row: ComposeRow) => {
      const name = row.Name || row.Service || row.name;
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((row: ComposeRow) => ({
      name: row.Name || row.Service || row.name || 'unknown',
      state: row.State || row.state || row.Status || row.status || 'unknown',
      health: row.Health || row.health || 'n/a',
      uptime: (row.Name || row.Service || row.name) === 'recyclarr'
        ? syncInfo.display
        : row.RunningFor || row.runningFor || row.RunningForSeconds || '',
      ports: formatPorts(row.Publishers || row.publishers || row.Ports || row.ports || [])
    }));
}

function printHealthTable(entries: HealthEntry[]): void {
  const headers = ['SERVICE', 'STATE', 'HEALTH', 'UPTIME', 'PORTS'];
  const colWidths = [18, 14, 10, 14, 0];
  const pad = (str: string, len: number): string => {
    if (len === 0) return str; // last column free-form
    const plainLen = stripAnsi(str).length;
    if (plainLen >= len) return str;
    return str + ' '.repeat(len - plainLen);
  };

  console.log(
    [
      pad(headers[0], colWidths[0]),
      pad(headers[1], colWidths[1]),
      pad(headers[2], colWidths[2]),
      pad(headers[3], colWidths[3]),
      headers[4]
    ].join(' ')
  );

  entries.forEach((r) => {
    const health = formatHealth(r.health);
    const uptime = typeof r.uptime === 'number' ? `${r.uptime}s` : (r.uptime || '');
    console.log(
      [
        pad(r.name, colWidths[0]),
        pad(r.state, colWidths[1]),
        pad(health, colWidths[2]),
        pad(uptime, colWidths[3]),
        r.ports
      ].join(' ')
    );
  });
}

function checkMounts(): MountCheckResult {
  const env = envLib.loadEnv(baseDir);
  const downloadsRoot = env.DOWNLOADS_ROOT || '/Volumes/SCRAPFS/downloads';
  const incompleteRoot = env.INCOMPLETE_ROOT || `${downloadsRoot}/incomplete`;
  const paths: Record<string, string> = {
    JELLYFIN_MOVIES: env.JELLYFIN_MOVIES || '/Volumes/MEDIA1/Movies',
    JELLYFIN_SERIES: env.JELLYFIN_SERIES || '/Volumes/MEDIA1/Series',
    DOWNLOADS_ROOT: downloadsRoot,
    INCOMPLETE_ROOT: incompleteRoot,
    QBITTORRENT_WATCH: env.QBITTORRENT_WATCH || '/data/qbittorrent/watch'
  };
  let ok = true;
  for (const [key, value] of Object.entries(paths)) {
    const result = envLib.checkPath(value);
    const colored = result === '[ok]' ? green(result) : red(result);
    console.log(`${key}: ${value} ${colored}`);
    if (result !== '[ok]') ok = false;
  }
  return { ok };
}

function runDoctor(): number {
  console.log(cyan('=== HEALTH ==='));
  const entries = getHealthEntries();
  if (!entries) return 1;
  printHealthTable(entries);

  const healthIssues = entries.some((e) => {
    const state = (e.state || '').toLowerCase();
    const health = (e.health || '').toLowerCase();
    const badState = state && state !== 'running';
    const badHealth = health && health !== 'healthy' && health !== 'n/a';
    return badState || badHealth;
  });

  console.log('\n' + cyan('=== MOUNTS ==='));
  const mountRes = checkMounts();

  console.log('\n' + cyan('=== RECENT LOGS (Last 50 lines. Ignore if you have resolved them.) ==='));
  entries.forEach((entry) => {
    if (entry.name === 'recyclarr') {
      console.log(`${entry.name}: skipped (optional)`);
      return;
    }
    const res = runCompose(['logs', '--no-log-prefix', '--timestamps', '--tail', '50', entry.name], { capture: true }) as CommandResult;
    if (res.code !== 0) {
      console.log(`${entry.name}: ${red('[logs unavailable]')}`);
      return;
    }
    const lines = res.stdout.split(/\r?\n/);
    const errs = lines.filter((l) => /error|exception|fatal/i.test(l));
    if (errs.length === 0) {
      console.log(`${entry.name}: ${green('[ok]')}`);
    } else {
      const sample = errs.slice(-3).map((l) => colorLogLine(l, { red, yellow, dim })).join('\n    ');
      console.log(`${entry.name}: ${red(`[${errs.length} issue(s)]`)}
    ${sample}`);
    }
  });

  // Only fail if health or mounts are bad; log warnings do not fail when services are healthy.
  return healthIssues || !mountRes.ok ? 1 : 0;
}

function getRecyclarrLastSync(): RecyclarrSyncInfo {
  // Prefer persisted logs under /config
  const logPaths = [
    path.join(baseDir, 'data/recyclarr/config/logs'),
    path.join(baseDir, 'data/recyclarr/config')
  ];
  for (const candidate of logPaths) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const files = fs.readdirSync(candidate).filter((f) => f.endsWith('.log'));
      if (!files.length) continue;
      const latest = files
        .map((f) => ({ f, mtime: fs.statSync(path.join(candidate, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0].f;
      const content = fs.readFileSync(path.join(candidate, latest), 'utf-8');
      const res = parseRecyclarrLogContent(content);
      if (res) return res;
    } catch (err) {
      // fall through to next source
    }
  }

  // Fallback: container logs
  try {
    const res = runCompose(['logs', '--tail', '200', 'recyclarr'], { capture: true }) as CommandResult;
    if (res.code === 0 && res.stdout) {
      const parsed = parseRecyclarrLogContent(res.stdout);
      if (parsed) return parsed;
    }
  } catch (err) {
    // ignore
  }

  return { display: yellow('last sync: unknown') };
}

function parseRecyclarrLogContent(content: string): RecyclarrSyncInfo | null {
  const lines = content.split(/\r?\n/).filter(Boolean).reverse();
  const target = lines.find((l) => /\d{4}-\d{2}-\d{2}T/.test(l));
  if (!target) return null;
  const tsMatch = target.match(/(\d{4}-\d{2}-\d{2}T[^\s]+)/);
  const ts = tsMatch ? tsMatch[1] : 'unknown-time';
  const isError = /error|fail/i.test(target);
  const statusText = isError ? red('error') : green('ok');
  return { display: `${dim('last sync:')} ${ts} (${statusText})` };
}

function ensureArg(val: unknown, usage: string): void {
  if (!val) throw usageError(usage);
}

function usageError(msg: string): Error {
  return new Error(`Usage: ms ${msg}`);
}

async function main(): Promise<void> {
  const [, , cmdArg, ...args] = process.argv;
  if (!cmdArg || cmdArg === '--help' || cmdArg === '-h') {
    printHelp();
    process.exit(0);
  }
  const fn = commands[cmdArg];
  if (!fn) {
    console.error(`Unknown command: ${cmdArg}`);
    printHelp();
    process.exit(1);
  }
  try {
    const code = await fn(args);
    if (typeof code === 'number') process.exit(code);
    process.exit(0);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(error.message || err);
    process.exit(1);
  }
}

void main();
