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
}
