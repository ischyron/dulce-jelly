export interface ProwlarrSearchResult {
  title: string;
  indexer: string | null;
  protocol: 'torrent' | 'usenet' | 'unknown';
  size: number | null;
  publishDate: string | null;
  guid: string | null;
  downloadUrl: string | null;
  seeders: number | null;
  peers: number | null;
}

export interface ProwlarrIndexer {
  id: number;
  name: string | null;
  protocol: 'torrent' | 'usenet' | 'unknown';
}

interface RawProwlarrSearchItem {
  title?: unknown;
  indexer?: unknown;
  protocol?: unknown;
  size?: unknown;
  publishDate?: unknown;
  guid?: unknown;
  downloadUrl?: unknown;
  seeders?: unknown;
  peers?: unknown;
}

interface RawProwlarrIndexer {
  id?: unknown;
  name?: unknown;
  protocol?: unknown;
}

interface UsenetFeedSearchOptions {
  query: string;
  imdbId?: string | null;
  categories?: string;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toProtocol(v: unknown): 'torrent' | 'usenet' | 'unknown' {
  if (typeof v !== 'string') return 'unknown';
  const p = v.toLowerCase();
  if (p === 'torrent' || p === 'usenet') return p;
  return 'unknown';
}

function stripCdata(value: string): string {
  const m = value.match(/^<!\[CDATA\[(.*)\]\]>$/s);
  return m ? m[1] : value;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeImdbId(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9]/g, '');
}

function titleTokenMatch(title: string, query: string): boolean {
  const titleNorm = title.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 || /^[0-9]{4}$/.test(t));
  if (tokens.length === 0) return true;
  const matches = tokens.filter((t) => titleNorm.includes(t)).length;
  const required = Math.min(2, tokens.length);
  return matches >= required;
}

function getTagValue(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return null;
  return decodeXmlEntities(stripCdata(m[1].trim()));
}

function getTorznabAttr(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<torznab:attr\\s+[^>]*name="${name}"[^>]*value="([^"]*)"[^>]*/?>`, 'i'));
  if (!m) return null;
  return decodeXmlEntities(m[1].trim());
}

function parseUsenetFeedXml(
  xml: string,
  indexerName: string | null,
  opts?: { imdbId?: string | null; query?: string },
): ProwlarrSearchResult[] {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const out: ProwlarrSearchResult[] = [];
  const expectedImdb = normalizeImdbId(opts?.imdbId);
  for (const block of itemBlocks) {
    const title = getTagValue(block, 'title') ?? 'Unknown';
    const itemImdb = normalizeImdbId(
      getTorznabAttr(block, 'imdb') ?? getTorznabAttr(block, 'imdbid') ?? getTorznabAttr(block, 'imdbId'),
    );
    const imdbMatch = expectedImdb.length > 0 && itemImdb.length > 0 && itemImdb === expectedImdb;
    const titleMatch = titleTokenMatch(title, opts?.query ?? '');
    if (!imdbMatch && !titleMatch) continue;
    const guid = getTagValue(block, 'guid');
    const link = getTagValue(block, 'link');
    const pubDate = getTagValue(block, 'pubDate');
    const sizeTag = getTagValue(block, 'size');
    const sizeAttr = getTorznabAttr(block, 'size');
    const sizeRaw = sizeTag ?? sizeAttr;
    const sizeNum = sizeRaw != null ? Number(sizeRaw) : Number.NaN;
    out.push({
      title,
      indexer: indexerName,
      protocol: 'usenet',
      size: Number.isFinite(sizeNum) ? sizeNum : null,
      publishDate: pubDate,
      guid: guid || null,
      downloadUrl: link || null,
      seeders: null,
      peers: null,
    });
  }
  return out;
}

export class ProwlarrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async request(path: string, params?: URLSearchParams): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of params.entries()) url.searchParams.append(k, v);
    }
    const controller = new AbortController();
    // Live indexer fan-out can be slow; avoid aborting legitimate searches too early.
    const timeout = setTimeout(() => controller.abort(), 35_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'X-Api-Key': this.apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Prowlarr error ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.json();
  }

  async listIndexers(): Promise<ProwlarrIndexer[]> {
    const payload = await this.request('/api/v1/indexer');
    if (!Array.isArray(payload)) return [];
    return payload
      .map((it) => {
        const row = it as RawProwlarrIndexer;
        const id = asNumber(row.id);
        if (id == null) return null;
        return {
          id,
          name: asString(row.name),
          protocol: toProtocol(row.protocol),
        };
      })
      .filter((x): x is ProwlarrIndexer => x != null);
  }

  async searchMovie(query: string, opts?: { indexerIds?: number[] }): Promise<ProwlarrSearchResult[]> {
    const params = new URLSearchParams();
    params.set('query', query);
    params.set('type', 'movie');
    for (const id of opts?.indexerIds ?? []) {
      if (Number.isFinite(id) && id > 0) params.append('indexerIds', String(id));
    }
    const payload = await this.request('/api/v1/search', params);
    if (!Array.isArray(payload)) return [];

    return payload.map((it) => {
      const row = it as RawProwlarrSearchItem;
      return {
        title: asString(row.title) ?? 'Unknown',
        indexer: asString(row.indexer),
        protocol: toProtocol(row.protocol),
        size: asNumber(row.size),
        publishDate: asString(row.publishDate),
        guid: asString(row.guid),
        downloadUrl: asString(row.downloadUrl),
        seeders: asNumber(row.seeders),
        peers: asNumber(row.peers),
      };
    });
  }

  async searchUsenetIndexerFeed(
    indexerId: number,
    indexerName: string | null,
    opts: UsenetFeedSearchOptions,
  ): Promise<ProwlarrSearchResult[]> {
    const safeId = Number(indexerId);
    if (!Number.isFinite(safeId) || safeId <= 0) return [];
    const cat = opts.categories?.trim() || '2000';

    // Prefer imdb-based movie search when available; fallback to free-text search.
    const attempts: Array<{ t: 'movie' | 'search'; params: Record<string, string> }> = [];
    if (opts.imdbId && opts.imdbId.trim()) {
      attempts.push({ t: 'movie', params: { imdbid: opts.imdbId.trim(), cat } });
    }
    if (opts.query.trim()) {
      attempts.push({ t: 'search', params: { q: opts.query.trim(), cat } });
    }

    const seen = new Map<string, ProwlarrSearchResult>();
    for (const attempt of attempts) {
      const u = new URL(`${this.baseUrl}/${safeId}/api`);
      u.searchParams.set('apikey', this.apiKey);
      u.searchParams.set('t', attempt.t);
      for (const [k, v] of Object.entries(attempt.params)) u.searchParams.set(k, v);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      let res: Response;
      try {
        res = await fetch(u, { method: 'GET', signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) continue;
      const xml = await res.text();
      for (const row of parseUsenetFeedXml(xml, indexerName, { imdbId: opts.imdbId, query: opts.query })) {
        const key = row.guid || row.downloadUrl || `${row.title.toLowerCase()}|${row.size ?? 0}`;
        if (!seen.has(key)) seen.set(key, row);
      }
      if (seen.size > 0) break;
    }
    return [...seen.values()];
  }
}
