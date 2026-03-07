import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const ARTIFACT_DIRS = ['test/results', 'playwright-report'];

function cleanupArtifacts() {
  for (const dir of ARTIFACT_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
}

cleanupArtifacts();

const child = spawn('npx', ['playwright', 'test', '--config=playwright.config.cjs', '--reporter=line'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  // On success, remove transient artifacts to keep local disk usage bounded.
  if (code === 0 && !signal) cleanupArtifacts();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
