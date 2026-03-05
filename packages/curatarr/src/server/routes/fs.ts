import fs from 'node:fs/promises';
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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDockerRuntime(): Promise<boolean> {
  if (await pathExists('/.dockerenv')) return true;
  try {
    const cgroup = await fs.readFile('/proc/1/cgroup', 'utf8');
    return /docker|containerd|kubepods/i.test(cgroup);
  } catch {
    return false;
  }
}

async function listMountedPaths(): Promise<string[]> {
  try {
    const raw = await fs.readFile('/proc/self/mountinfo', 'utf8');
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
        normalized === '/' ||
        normalized.startsWith('/proc') ||
        normalized.startsWith('/sys') ||
        normalized.startsWith('/dev') ||
        normalized.startsWith('/run') ||
        normalized.startsWith('/var/lib/docker')
      )
        continue;
      if (!(await pathExists(normalized))) continue;
      out.add(normalized);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function getBrowseRoots(): Promise<BrowseRootInfo> {
  if (await isDockerRuntime()) {
    const mounted = await listMountedPaths();
    const fallbackCandidates = ['/media', '/data', '/config'];
    const fallback = (
      await Promise.all(fallbackCandidates.map(async (p) => ((await pathExists(p)) ? p : null)))
    ).filter(Boolean) as string[];
    const roots = (mounted.length > 0 ? mounted : fallback).map(normalizeDir);
    return { mode: 'docker-mounted', roots: roots.length > 0 ? roots : ['/'], restricted: true };
  }
  return { mode: 'local-full', roots: ['/'], restricted: false };
}

async function realDir(p: string): Promise<string | null> {
  try {
    return normalizeDir(await fs.realpath(p));
  } catch {
    return null;
  }
}

function withinRoots(candidateReal: string, rootsReal: string[]): boolean {
  return rootsReal.some((root) => candidateReal === root || candidateReal.startsWith(`${root}${path.sep}`));
}

export function makeFsRoutes(): Hono {
  const app = new Hono();

  app.get('/roots', async (c) => {
    const info = await getBrowseRoots();
    return c.json(info);
  });

  app.get('/browse', async (c) => {
    const info = await getBrowseRoots();
    const rootsReal = (await Promise.all(info.roots.map((r) => realDir(r)))).filter(Boolean) as string[];

    const requested = c.req.query('path');
    const currentPath = normalizeDir(requested || info.roots[0] || '/');

    if (!(await pathExists(currentPath))) {
      return c.json({ error: `Path does not exist: ${currentPath}` }, 400);
    }

    const currentReal = await realDir(currentPath);
    if (!currentReal) {
      return c.json({ error: `Unable to resolve path: ${currentPath}` }, 400);
    }

    const stat = await fs.lstat(currentPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return c.json({ error: `Path is not a directory: ${currentPath}` }, 400);
    }
    if (stat.isSymbolicLink()) {
      return c.json({ error: `Path must not be a symlink: ${currentPath}` }, 400);
    }

    if (info.restricted && rootsReal.length > 0 && !withinRoots(currentReal, rootsReal)) {
      return c.json({ error: `Path is outside allowed roots: ${currentPath}` }, 403);
    }

    const entries = (await fs.readdir(currentPath, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .filter((d) => !d.isSymbolicLink())
      .map((d) => ({ name: d.name, path: path.join(currentPath, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = normalizeDir(path.dirname(currentPath));
    const parentReal = await realDir(parentPath);
    const canGoParent =
      parentPath !== currentPath &&
      !!parentReal &&
      (!info.restricted || rootsReal.length === 0 || withinRoots(parentReal, rootsReal));

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
