const { runCompose, runCommand } = require('./docker');
const envLib = require('./env');
const { resolveServiceLoose, parseUpArgs } = require('./utils');

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
  const svc = resolveServiceLoose(args[0]);
  return runCompose(['logs', '-f', svc]);
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
  testCmd
};
