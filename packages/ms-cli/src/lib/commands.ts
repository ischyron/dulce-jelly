import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { runCompose, runComposeStreaming, runCommand, CommandResult } from './docker';
import * as envLib from './env';
import { resolveServiceLoose, parseUpArgs } from './utils';

const baseDir = path.join(__dirname, '..', '..', '..', '..');
const QB_PROFILE = 'quality-broker';

export function up(args: string[]): number {
  const { force, services } = parseUpArgs(args);
  const composeArgs = ['up', '-d'];
  if (force) composeArgs.push('--force-recreate');
  if (services.length) composeArgs.push(...services.map(resolveServiceLoose));
  return runCompose(composeArgs) as number;
}

export function down(): number {
  return runCompose(['down']) as number;
}

export function status(): number {
  return runCompose(['ps']) as number;
}

export function start(args: string[]): number {
  const svcs = (args || []).map(resolveServiceLoose).filter(Boolean);
  return runCompose(['start', ...svcs]) as number;
}

export function stop(args: string[]): number {
  const svcs = (args || []).map(resolveServiceLoose).filter(Boolean);
  return runCompose(['stop', ...svcs]) as number;
}

export function logs(args: string[]): Promise<number> {
  const svc = args && args.length ? resolveServiceLoose(args[0]) : null;
  const baseCmd = ['--ansi', 'always', 'logs', '-f'];
  if (svc) baseCmd.push(svc);
  return runComposeStreaming(baseCmd);
}

export function restart(args: string[]): number {
  const svc = resolveServiceLoose(args[0]);
  return runCompose(['restart', svc]) as number;
}

export function reload(args: string[]): number {
  const target = args[0];
  if (target === 'caddy') {
    return runCompose(['exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']) as number;
  }
  if (target === 'tunnel') {
    return runCompose(['restart', 'cloudflared']) as number;
  }
  return 1;
}

export function sync(): number {
  return runCompose(['run', '--rm', 'recyclarr', 'sync']) as number;
}

export function qualityBrokerRun(args: string[]): number {
  let extra = args || [];
  if (extra[0] === '--') {
    extra = extra.slice(1);
  }
  return runCompose(['run', '--rm', 'quality-broker', 'node', 'dist/index.js', 'run', ...extra]) as number;
}

export function qualityBrokerLogs(): number | Promise<number> {
  // Prefer tailing latest broker JSON log if present (container is short-lived)
  const logDir = path.join(baseDir, 'data/quality-broker/logs');
  if (fs.existsSync(logDir)) {
    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.json')).sort().reverse();
    if (files.length) {
      const latest = path.join(logDir, files[0]);
      console.log(`Tailing ${latest}`);
      return runCommand('tail', ['-n', '200', latest]) as number;
    }
  }
  console.log('No quality-broker log file found; falling back to compose logs');
  return runComposeStreaming(['--profile', QB_PROFILE, 'logs', '-f', 'quality-broker']);
}

export function upgrade(args: string[]): number {
  const svc = args && args.length ? resolveServiceLoose(args[0]) : null;
  const services = svc ? [svc] : [];
  const pullCode = runCompose(['pull', ...services]) as number;
  if (pullCode !== 0) return pullCode;
  return runCompose(['up', '-d', ...services]) as number;
}

export function testCmd(baseDir: string): number {
  const env = envLib.loadEnv(baseDir);
  return runCommand('node', ['--test', 'test/test-services.test.mjs'], { cwd: baseDir, env }) as number;
}

const SMART_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function smartDateStr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = SMART_MONTHS[d.getMonth()];
  return `${dd}-${mon}-${d.getFullYear()}`;
}

/** Mount a volume by label on macOS if /Volumes/<label> is absent. */
function ensureMountedMacos(label: string): void {
  if (fs.existsSync(`/Volumes/${label}`)) return;
  console.log(`[smart] /Volumes/${label} not mounted — running: diskutil mount ${label}`);
  const res = runCommand('diskutil', ['mount', label]) as number;
  if (res !== 0) console.warn(`[smart] warn: diskutil mount returned ${res}; continuing`);
}

interface MacDiskInfo {
  bytes: number;
  /** Whole-disk device node, e.g. /dev/disk10 (physical, not APFS container). */
  physicalDevice: string;
}

/**
 * Resolve a macOS volume label to its underlying physical disk device and byte capacity.
 *
 * For APFS volumes we follow:  volume → APFS Physical Store (disk10s2) → strip partition → /dev/disk10
 * For non-APFS:                volume → Device Node (disk4s1)           → strip partition → /dev/disk4
 *
 * Docker Desktop's Linux VM has no raw USB block device access, so we must
 * run smartctl on the macOS host against this physical device path.
 */
function getMacDiskInfo(label: string): MacDiskInfo | null {
  const r = spawnSync('diskutil', ['info', `/Volumes/${label}`], { encoding: 'utf-8' });
  if (r.status !== 0 || !r.stdout) return null;

  const sizeMatch = r.stdout.match(/Disk Size:\s+[^(]+\((\d+)\s+Bytes\)/);
  if (!sizeMatch) return null;
  const bytes = parseInt(sizeMatch[1], 10);

  // Prefer APFS Physical Store — gives us the real spinning/SSD device, not the virtual container.
  const apfsMatch = r.stdout.match(/APFS Physical Store:\s+(\S+)/);
  const rawId = apfsMatch
    ? apfsMatch[1].replace(/s\d+$/, '')                        // disk10s2 → disk10
    : (r.stdout.match(/Device Node:\s+\/dev\/(\S+)/) || [])[1]?.replace(/s\d+$/, ''); // disk11s1 → disk11

  return rawId ? { bytes, physicalDevice: `/dev/${rawId}` } : null;
}

/** Find smartctl binary on macOS (Homebrew ARM/Intel or PATH). */
function findSmartctlMacos(): string | null {
  for (const p of ['/opt/homebrew/bin/smartctl', '/usr/local/bin/smartctl']) {
    if (fs.existsSync(p)) return p;
  }
  const r = spawnSync('which', ['smartctl'], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** Run a smartctl command on the macOS host, capturing stdout + stderr combined. */
function runSmartctlHost(bin: string, args: string[]): string {
  const r = spawnSync(bin, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return [(r.stdout || '').trimEnd(), (r.stderr || '').trimEnd()].filter(Boolean).join('\n');
}

function buildReport(
  bar: string, label: string, testType: string, dateStr: string,
  device: string, body: string, note?: string
): string {
  return [
    bar,
    'SMART REPORT',
    `Volume  : ${label}`,
    `Device  : ${device}`,
    `Test    : ${testType.toUpperCase()}`,
    `Date    : ${dateStr}`,
    `Command : ms smart --${testType} ${label}`,
    ...(note ? [`Note    : ${note}`] : []),
    bar,
    '',
    body.trimEnd(),
    '',
    bar,
    'Generated by dulce-jelly ms-cli (storage-utils / smartmontools)',
    bar,
    '',
  ].join('\n');
}

export async function smart(args: string[]): Promise<number> {
  let testType: 'short' | 'long' = 'short';
  const labels: string[] = [];

  for (const arg of args) {
    if (arg === '--short') testType = 'short';
    else if (arg === '--long') testType = 'long';
    else if (!arg.startsWith('-')) labels.push(arg);
  }

  if (labels.length === 0) {
    console.error('Usage: ms smart [--short|--long] <LABEL...>  (default: --short)');
    console.error('Example: ms smart MEDIA1 MEDIA2 --long');
    return 1;
  }

  const reportDir = path.join(baseDir, 'temp', 'smart-reports');
  fs.mkdirSync(reportDir, { recursive: true });

  const dateStr = smartDateStr(new Date());
  const bar = '='.repeat(72);
  let exitCode = 0;

  for (const label of labels) {
    console.log(`\n[smart] ${testType.toUpperCase()} test — ${label}`);

    if (process.platform === 'darwin') {
      // ── macOS: host smartctl on physical device ─────────────────────────────
      // Docker Desktop's Linux VM receives no raw USB block device access —
      // external drives appear only via VirtioFS filesystem passthrough, never
      // as /dev/sd* entries. smartctl inside the container sees nothing.
      // We must run on the host, targeting the physical disk (/dev/disk10) that
      // backs the APFS volume, not the volume device itself (/dev/disk11s1).
      ensureMountedMacos(label);

      const info = getMacDiskInfo(label);
      if (!info) {
        console.error(`[smart] Cannot resolve disk for /Volumes/${label} — is the drive connected?`);
        exitCode = 1;
        continue;
      }

      const smartctlBin = findSmartctlMacos();
      if (!smartctlBin) {
        console.error('[smart] smartctl not found on host. Install with: brew install smartmontools');
        exitCode = 1;
        continue;
      }

      console.log(`[smart] Physical device: ${info.physicalDevice}  (${info.bytes} bytes)`);
      console.log(`[smart] Using host smartctl: ${smartctlBin}`);

      const sections: Array<{ title: string; args: string[] }> = [
        { title: 'DEVICE INFORMATION',                     args: ['-d', 'auto', '-i', info.physicalDevice] },
        { title: 'HEALTH ASSESSMENT',                      args: ['-d', 'auto', '-H', info.physicalDevice] },
        { title: 'SMART ATTRIBUTES',                       args: ['-d', 'auto', '-A', info.physicalDevice] },
        { title: `INITIATING ${testType.toUpperCase()} TEST`, args: ['-d', 'auto', '-t', testType, info.physicalDevice] },
      ];

      let body = `DEVICE: ${info.physicalDevice}\n`;
      let allFailed = true;
      for (const { title, args } of sections) {
        body += `\n--- ${title} ---\n`;
        const out = runSmartctlHost(smartctlBin, args);
        body += out + '\n';
        if (!out.includes('failed:') && !out.includes('not supported')) allFailed = false;
      }

      if (allFailed) {
        body += '\n--- DIAGNOSIS ---\n';
        body += 'All smartctl calls failed. Possible causes:\n';
        body += '  1. USB enclosure bridge chip does not pass SMART commands (most common)\n';
        body += '  2. macOS IOKit blocks SMART access for this device type\n';
        body += '  3. Drive requires a specific USB bridge device type flag\n';
        body += '\nTo confirm IOKit visibility: smartctl --scan-open\n';
        body += 'To try on Linux: attach drive to a Linux host and run: ms smart ' + label + '\n';
        console.warn(`[smart] warn: all smartctl calls failed for ${info.physicalDevice} — USB enclosure may not support SMART pass-through`);
      }

      const report = buildReport(bar, label, testType, dateStr, info.physicalDevice, body,
        `host smartctl (${smartctlBin}) — Docker Desktop VM has no raw USB block device access on macOS`);
      process.stdout.write(report);
      const filename = `${label}_${dateStr}.txt`;
      fs.writeFileSync(path.join(reportDir, filename), report, 'utf-8');
      console.log(`[smart] Saved: temp/smart-reports/${filename}`);

    } else {
      // ── Linux: storage-utils container with blkid ───────────────────────────
      const scriptLines = [
        `DEVICE=$(blkid -L '${label}' 2>/dev/null)`,
        `if [ -z "$DEVICE" ]; then echo "ERROR: no block device with label '${label}' found"; exit 1; fi`,
        'echo "DEVICE: $DEVICE"',
        `printf "\\n--- DEVICE INFORMATION ---\\n"; smartctl -i "$DEVICE" 2>&1`,
        `printf "\\n--- HEALTH ASSESSMENT ---\\n"; smartctl -H "$DEVICE" 2>&1`,
        `printf "\\n--- SMART ATTRIBUTES ---\\n"; smartctl -A "$DEVICE" 2>&1`,
        `printf "\\n--- INITIATING ${testType.toUpperCase()} TEST ---\\n"; smartctl -t ${testType} "$DEVICE" 2>&1`,
      ];
      const script = scriptLines.join('; ');

      const result = runCompose(
        ['--profile', 'storage-utils', 'run', '--rm', '-T', 'storage-utils', '-c', script],
        { capture: true }
      ) as CommandResult;

      const device = (result.stdout.match(/^DEVICE:\s*(\S+)/m) || [])[1] || 'unknown';
      const report = buildReport(bar, label, testType, dateStr, device, result.stdout);
      process.stdout.write(report);
      const filename = `${label}_${dateStr}.txt`;
      fs.writeFileSync(path.join(reportDir, filename), report, 'utf-8');
      console.log(`[smart] Saved: temp/smart-reports/${filename}`);

      if (result.code >= 8) exitCode = result.code;
    }
  }

  return exitCode;
}
