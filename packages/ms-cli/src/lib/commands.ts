import * as fs from 'fs';
import * as path from 'path';
import { runCompose, runCommand } from './docker';
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

export function logs(args: string[]): number {
  const svc = args && args.length ? resolveServiceLoose(args[0]) : null;
  const baseCmd = ['--ansi', 'always', 'logs', '-f'];
  if (svc) baseCmd.push(svc);
  return runCompose(baseCmd) as number;
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

export function qualityBrokerLogs(): number {
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
  return runCompose(['--profile', QB_PROFILE, 'logs', '-f', 'quality-broker']) as number;
}

export function testCmd(baseDir: string): number {
  const env = envLib.loadEnv(baseDir);
  return runCommand('node', ['--test', 'test/test-services.test.mjs'], { cwd: baseDir, env }) as number;
}
