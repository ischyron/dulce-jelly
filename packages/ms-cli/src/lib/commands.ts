import * as fs from 'fs';
import * as path from 'path';
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

/** On macOS, mount a volume by label if /Volumes/<label> is not present. */
function ensureMountedMacos(label: string): void {
  const mountpoint = `/Volumes/${label}`;
  if (fs.existsSync(mountpoint)) return;
  console.log(`[smart] ${mountpoint} not mounted — attempting diskutil mount ${label} ...`);
  const res = runCommand('diskutil', ['mount', label]) as number;
  if (res !== 0) {
    console.warn(`[smart] warn: diskutil mount returned ${res}; continuing anyway`);
  }
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
  const isMac = process.platform === 'darwin';
  const bar = '='.repeat(72);

  let exitCode = 0;
  for (const label of labels) {
    console.log(`\n[smart] ${testType.toUpperCase()} test — ${label}`);

    // On macOS: ensure the volume is mounted so Docker Desktop exposes it to the Linux VM.
    if (isMac) ensureMountedMacos(label);

    // Resolve label → device via blkid inside the container, then run all smartctl sections.
    // Sections are joined with ; so they all execute even if one returns advisory exit codes.
    const setup = [
      'apk add -q --no-cache smartmontools util-linux',
      `DEVICE=$(blkid -L '${label}' 2>/dev/null)`,
      `[ -z "$DEVICE" ] && echo "ERROR: no block device with label '${label}' found" && exit 1`
    ].join(' && ');

    const sections = [
      'printf "DEVICE: $DEVICE\\n"',
      'printf "\\n--- DEVICE INFORMATION ---\\n"; smartctl -i "$DEVICE"',
      'printf "\\n--- HEALTH ASSESSMENT ---\\n"; smartctl -H "$DEVICE"',
      'printf "\\n--- SMART ATTRIBUTES ---\\n"; smartctl -A "$DEVICE"',
      `printf "\\n--- INITIATING ${testType.toUpperCase()} TEST ---\\n"; smartctl -t ${testType} "$DEVICE"`
    ].join('; ');

    const script = `${setup} && ${sections}`;

    // Capture stdout; Docker progress (stderr) still streams to the terminal.
    const result = runCompose(
      ['--profile', 'storage-utils', 'run', '--rm', '-T', 'storage-utils', '-c', script],
      { capture: true }
    ) as CommandResult;

    // Build the report.
    const report = [
      bar,
      `SMART REPORT`,
      `Volume : ${label}`,
      `Test   : ${testType.toUpperCase()}`,
      `Date   : ${dateStr}`,
      bar,
      '',
      result.stdout.trimEnd(),
      '',
      bar,
      'Generated by dulce-jelly ms-cli (storage-utils / smartmontools)',
      bar,
      ''
    ].join('\n');

    // Print to console and save file.
    process.stdout.write(report);
    const filename = `${label}_${dateStr}.txt`;
    fs.writeFileSync(path.join(reportDir, filename), report, 'utf-8');
    console.log(`\n[smart] Saved: temp/smart-reports/${filename}`);

    // smartctl exit codes are bitmasks; bits 0-2 (codes 1-7) are advisory, not failures.
    if (result.code >= 8) exitCode = result.code;
  }
  return exitCode;
}
