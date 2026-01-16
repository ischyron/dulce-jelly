const { spawnSync } = require('child_process');
const path = require('path');

const baseDir = path.join(__dirname, '..', '..');

function runCompose(args, opts = {}) {
  const { capture = false } = opts;
  const res = spawnSync('docker', ['compose', ...args], {
    cwd: baseDir,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8'
  });
  if (capture) {
    return { code: res.status || 0, stdout: res.stdout || '' };
  }
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
  return res.status || 0;
}

function runCommand(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    ...opts,
    stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8'
  });
  if (opts.capture) {
    return { code: res.status || 0, stdout: res.stdout || '' };
  }
  return res.status || 0;
}

module.exports = { runCompose, runCommand };
