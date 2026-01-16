const serviceMap = {
  jf: 'jellyfin',
  js: 'jellyseerr',
  qb: 'qbittorrent',
  ra: 'radarr',
  so: 'sonarr',
  pr: 'prowlarr',
  sb: 'sabnzbd',
  rc: 'recyclarr',
  ca: 'caddy',
  cf: 'cloudflared'
};

function resolveService(key) {
  if (!key) return null;
  const lower = key.toLowerCase();
  if (serviceMap[lower]) return serviceMap[lower];
  const values = Object.values(serviceMap);
  const exact = values.find((v) => v.toLowerCase() === lower);
  if (exact) return exact;
  return null;
}

function resolveServiceLoose(key) {
  return resolveService(key) || key;
}

function parseUpArgs(args) {
  const out = { force: false, services: [] };
  for (const arg of args) {
    if (arg === '--force' || arg === '--force-recreate' || arg === '-f') {
      out.force = true;
      continue;
    }
    out.services.push(arg);
  }
  return out;
}

function parseComposeJson(stdout) {
  const text = stdout.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [];
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

function formatPorts(val) {
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

function colorLogLine(line, { red, yellow, dim }) {
  let out = line;
  out = out.replace(/\b(ERROR|FATAL|EXCEPTION)\b/gi, (m) => red(m));
  out = out.replace(/\b(WRN|WARN|WARNING)\b/gi, (m) => yellow(m));
  out = out.replace(/\b(INFO)\b/gi, (m) => dim(m));
  return out;
}

module.exports = {
  serviceMap,
  resolveService,
  resolveServiceLoose,
  parseUpArgs,
  parseComposeJson,
  formatPorts,
  colorLogLine
};
