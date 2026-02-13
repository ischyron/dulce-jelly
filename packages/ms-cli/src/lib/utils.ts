export const serviceMap: Record<string, string> = {
  jf: 'jellyfin',
  js: 'jellyseerr',
  qb: 'qbittorrent',
  ra: 'radarr',
  so: 'sonarr',
  pr: 'prowlarr',
  sb: 'sabnzbd',
  fs: 'flaresolverr',
  ht: 'huntarr',
  rc: 'recyclarr',
  qbq: 'quality-broker',
  ca: 'caddy',
  cf: 'cloudflared'
};

export function resolveService(key: string | undefined): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();
  if (serviceMap[lower]) return serviceMap[lower];
  const values = Object.values(serviceMap);
  const exact = values.find((v) => v.toLowerCase() === lower);
  if (exact) return exact;
  return null;
}

export function resolveServiceLoose(key: string): string {
  return resolveService(key) || key;
}

export interface UpArgs {
  force: boolean;
  services: string[];
}

export function parseUpArgs(args: string[]): UpArgs {
  const out: UpArgs = { force: false, services: [] };
  for (const arg of args) {
    if (arg === '--force' || arg === '--force-recreate' || arg === '-f') {
      out.force = true;
      continue;
    }
    out.services.push(arg);
  }
  return out;
}

export interface Publisher {
  URL?: string;
  PublishedPort?: number;
  TargetPort?: number;
  Protocol?: string;
}

export interface ComposeRow {
  Name?: string;
  Service?: string;
  name?: string;
  State?: string;
  state?: string;
  Status?: string;
  status?: string;
  Health?: string;
  health?: string;
  RunningFor?: string;
  runningFor?: string;
  RunningForSeconds?: number;
  Publishers?: Publisher[];
  publishers?: Publisher[];
  Ports?: string | Publisher[];
  ports?: string | Publisher[];
}

export function parseComposeJson(stdout: string): ComposeRow[] {
  const text = stdout.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items: ComposeRow[] = [];
    for (const line of lines) {
      try {
        items.push(JSON.parse(line));
      } catch (err) {
        return [];
      }
    }
    return items;
  }
}

export function formatPorts(val: string | Publisher[] | undefined): string {
  if (Array.isArray(val)) {
    const mapped = val
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p.PublishedPort && p.TargetPort && p.Protocol) {
          return `${p.URL ? p.URL + ' ' : ''}${p.PublishedPort}->${p.TargetPort}/${p.Protocol}`;
        }
        return '';
      })
      .filter(Boolean);
    return mapped.join(', ');
  }
  if (typeof val === 'string') return val;
  return '';
}

export function colorLogLine(line: string, colors: { red: (s: string) => string; yellow: (s: string) => string; dim: (s: string) => string }): string {
  const { red, yellow, dim } = colors;
  let out = line;
  out = out.replace(/\b(ERROR|FATAL|EXCEPTION)\b/gi, (m) => red(m));
  out = out.replace(/\b(WRN|WARN|WARNING)\b/gi, (m) => yellow(m));
  out = out.replace(/\b(INFO)\b/gi, (m) => dim(m));
  return out;
}
