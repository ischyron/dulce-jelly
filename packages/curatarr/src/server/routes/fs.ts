import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';

interface BrowseRootInfo {
  mode: 'docker-mounted' | 'local-full';
  roots: string[];
  restricted: boolean;
}

function normalizeDir(p: string): string {
  const resolved = path.resolve(p);
  return resolved.replace(/\/+$/, '') || '/';
}

function isDockerRuntime(): boolean {
  if (fs.existsSync('/.dockerenv')) return true;
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return /docker|containerd|kubepods/i.test(cgroup);
  } catch {
    return false;
  }
}

function listMountedPaths(): string[] {
  try {
    const raw = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const out = new Set<string>();
    for (const line of lines) {
      const [left] = line.split(' - ');
      const cols = left.split(' ');
      if (cols.length < 5) continue;
      const mountPoint = cols[4];
      if (!mountPoint.startsWith('/')) continue;
      const normalized = normalizeDir(mountPoint);
      if (
        normalized === '/'
        || normalized.startsWith('/proc')
        || normalized.startsWith('/sys')
        || normalized.startsWith('/dev')
        || normalized.startsWith('/run')
        || normalized.startsWith('/var/lib/docker')
      ) continue;
      if (!fs.existsSync(normalized)) continue;
      out.add(normalized);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function getBrowseRoots(): BrowseRootInfo {
  if (isDockerRuntime()) {
    const mounted = listMountedPaths();
    const fallback = ['/media', '/data', '/config'].filter((p) => fs.existsSync(p));
    const roots = (mounted.length > 0 ? mounted : fallback).map(normalizeDir);
    return { mode: 'docker-mounted', roots: roots.length > 0 ? roots : ['/'], restricted: true };
  }
  return { mode: 'local-full', roots: ['/'], restricted: false };
}

function realDir(p: string): string {
  return normalizeDir(fs.realpathSync(p));
}

function isWithinRoot(candidate: string, roots: string[]): boolean {
  const realCandidate = realDir(candidate);
  return roots.some((root) => {
    const realRoot = realDir(root);
    return realCandidate === realRoot || realCandidate.startsWith(`${realRoot}${path.sep}`);
  });
}

export function makeFsRoutes(): Hono {
  const app = new Hono();

  app.get('/roots', (c) => {
    const info = getBrowseRoots();
    return c.json(info);
  });

  app.get('/browse', (c) => {
    const info = getBrowseRoots();
    const requested = c.req.query('path');
    const currentPath = normalizeDir(requested || info.roots[0] || '/');

    if (!fs.existsSync(currentPath)) {
      return c.json({ error: `Path does not exist: ${currentPath}` }, 400);
    }
    if (!fs.statSync(currentPath).isDirectory()) {
      return c.json({ error: `Path is not a directory: ${currentPath}` }, 400);
    }
    if (info.restricted && !isWithinRoot(currentPath, info.roots)) {
      return c.json({ error: `Path is outside allowed roots: ${currentPath}` }, 403);
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, path: path.join(currentPath, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = normalizeDir(path.dirname(currentPath));
    const canGoParent = parentPath !== currentPath && (!info.restricted || isWithinRoot(parentPath, info.roots));

    return c.json({
      mode: info.mode,
      restricted: info.restricted,
      roots: info.roots,
      currentPath,
      parentPath: canGoParent ? parentPath : null,
      entries,
    });
  });

  return app;
}

