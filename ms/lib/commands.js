const fs = require('fs');
const path = require('path');
const { runCompose, runCommand } = require('./docker');
const envLib = require('./env');
const { resolveServiceLoose, parseUpArgs } = require('./utils');

const baseDir = path.join(__dirname, '..', '..');
const QB_PROFILE = 'quality-broker';

function up(args) {
  const { force, services } = parseUpArgs(args);
  const composeArgs = ['up', '-d'];
  if (force) composeArgs.push('--force-recreate');
  if (services.length) composeArgs.push(...services.map(resolveServiceLoose));
  return runCompose(composeArgs);
}

const down = () => runCompose(['down']);
const status = () => runCompose(['ps']);

function start(args) {
  const svcs = (args || []).map(resolveServiceLoose).filter(Boolean);
  return runCompose(['start', ...svcs]);
}

function stop(args) {
  const svcs = (args || []).map(resolveServiceLoose).filter(Boolean);
  return runCompose(['stop', ...svcs]);
}

function logs(args) {
  const svc = args && args.length ? resolveServiceLoose(args[0]) : null;
  const baseCmd = ['--ansi', 'always', 'logs', '-f'];
  if (svc) baseCmd.push(svc);
  return runCompose(baseCmd);
}

function restart(args) {
  const svc = resolveServiceLoose(args[0]);
  return runCompose(['restart', svc]);
}

function reload(args) {
  const target = args[0];
  if (target === 'caddy') {
    return runCompose(['exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
  }
  if (target === 'tunnel') {
    return runCompose(['restart', 'cloudflared']);
  }
  return 1;
}

const sync = () => runCompose(['run', '--rm', 'recyclarr', 'sync']);

function qualityBrokerRun(args) {
  const extra = args || [];
  return runCompose(['run', '--rm', 'quality-broker', 'node', 'dist/index.js', 'run', ...extra]);
}

function qualityBrokerLogs() {
  // Prefer tailing latest broker JSON log if present (container is short-lived)
  const logDir = path.join(baseDir, 'data/quality-broker/logs');
  if (fs.existsSync(logDir)) {
    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.json')).sort().reverse();
    if (files.length) {
      const latest = path.join(logDir, files[0]);
      console.log(`Tailing ${latest}`);
      return runCommand('tail', ['-n', '200', latest]);
    }
  }
  console.log('No quality-broker log file found; falling back to compose logs');
  return runCompose(['--profile', QB_PROFILE, 'logs', '-f', 'quality-broker']);
}

function testCmd(baseDir) {
  const env = envLib.loadEnv(baseDir);
  return runCommand('node', ['--test', 'test/test-services.test.mjs'], { cwd: baseDir, env });
}

module.exports = {
  up,
  down,
  status,
  start,
  stop,
  logs,
  restart,
  reload,
  sync,
  qualityBrokerRun,
  qualityBrokerLogs,
  testCmd
};
