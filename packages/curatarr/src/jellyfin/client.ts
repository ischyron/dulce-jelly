/**
 * Jellyfin read-only API client
 * Auth via JELLYFIN_URL + JELLYFIN_API_KEY env vars.
 * Never writes to Jellyfin.
 */

const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 30_000; // 30-second server-side cache for Jellyfin API responses

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface JfMovie {
  Id: string;
  Name: string;
  OriginalTitle?: string;
  ProductionYear?: number;
  Path?: string;                   // file path Jellyfin knows about
  CriticRating?: number;           // Metacritic 0-100
  CommunityRating?: number;        // IMDb-style 0-10
  OfficialRating?: string;         // MPAA
  Overview?: string;
  Genres?: string[];
  ProviderIds?: {
    Imdb?: string;
    Tmdb?: string;
    TmdbCollection?: string;
  };
  MediaSources?: Array<{
    Id: string;
    Path: string;
    Container: string;
    Size?: number;
  }>;
  UserData?: {
    PlayCount: number;
    IsFavorite: boolean;
    LastPlayedDate?: string;
  };
}

export interface JfLibrary {
  ItemId: string;
  Name: string;
  CollectionType?: string;
  Locations: string[];
}

export class JellyfinClient {
  private baseUrl: string;
  private apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache = new Map<string, CacheEntry<any>>();

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl ?? process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL ?? '').replace(/\/$/, '');
    this.apiKey = apiKey ?? process.env.JELLYFIN_API_KEY ?? '';

    if (!this.baseUrl) throw new Error('Jellyfin URL not set. Set JELLYFIN_URL env var.');
    if (!this.apiKey) throw new Error('Jellyfin API key not set. Set JELLYFIN_API_KEY env var.');
  }

  static isConfigured(): boolean {
    const url = process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL ?? '';
    const key = process.env.JELLYFIN_API_KEY ?? '';
    return !!(url && key);
  }

  // ──────────────────────────────────────────────────────────────────
  // Libraries
  // ──────────────────────────────────────────────────────────────────

  async getLibraries(): Promise<JfLibrary[]> {
    return this.get<JfLibrary[]>('/Library/VirtualFolders', DEFAULT_TIMEOUT_MS, true);
  }

  async getMovieLibraries(): Promise<JfLibrary[]> {
    const libs = await this.getLibraries();
    return libs.filter(l => l.CollectionType === 'movies');
  }

  // ──────────────────────────────────────────────────────────────────
  // Movies — batched fetch with progress
  // ──────────────────────────────────────────────────────────────────

  async getAllMovies(opts: {
    batchSize?: number;
    onProgress?: (fetched: number, total: number) => void;
    includeUserData?: boolean;
  } = {}): Promise<{ movies: JfMovie[]; errors: string[] }> {
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const libraries = await this.getMovieLibraries();
    const allMovies: JfMovie[] = [];
    const errors: string[] = [];

    for (const lib of libraries) {
      let startIndex = 0;
      let totalCount: number | null = null;

      while (true) {
        const fields = [
          'Path', 'ProviderIds', 'CriticRating', 'CommunityRating',
          'Genres', 'Overview', 'OfficialRating', 'MediaSources',
          ...(opts.includeUserData ? ['UserData'] : []),
        ].join(',');

        const qs = new URLSearchParams({
          ParentId: lib.ItemId,
          IncludeItemTypes: 'Movie',
          Recursive: 'true',
          StartIndex: String(startIndex),
          Limit: String(batchSize),
          Fields: fields,
        });

        try {
          const data = await this.get<{ Items: JfMovie[]; TotalRecordCount: number }>(
            `/Items?${qs}`
          );
          totalCount = data.TotalRecordCount;
          allMovies.push(...data.Items);
          startIndex += batchSize;

          if (opts.onProgress) opts.onProgress(allMovies.length, totalCount);

          if (startIndex >= totalCount) break;
        } catch (err) {
          errors.push(`Library ${lib.Name} batch ${startIndex}: ${(err as Error).message}`);
          break;
        }
      }
    }

    return { movies: allMovies, errors };
  }

  /** Fetch a single movie by Jellyfin ID (cached 30s) */
  async getMovie(jellyfinId: string): Promise<JfMovie> {
    return this.get<JfMovie>(
      `/Items/${jellyfinId}?Fields=Path,ProviderIds,CriticRating,CommunityRating,Genres,Overview`,
      DEFAULT_TIMEOUT_MS,
      true
    );
  }

  /** Search by title — returns candidates (not always exact) */
  async searchMovies(title: string, year?: number): Promise<JfMovie[]> {
    const qs = new URLSearchParams({
      SearchTerm: title,
      IncludeItemTypes: 'Movie',
      Recursive: 'true',
      Limit: '10',
      Fields: 'Path,ProviderIds,CriticRating,CommunityRating,Genres',
    });
    if (year) qs.set('Years', String(year));
    const data = await this.get<{ Items: JfMovie[] }>(`/Items?${qs}`);
    return data.Items;
  }

  // ──────────────────────────────────────────────────────────────────
  // HTTP transport
  // ──────────────────────────────────────────────────────────────────

  private async get<T>(apiPath: string, timeoutMs = DEFAULT_TIMEOUT_MS, cacheable = false): Promise<T> {
    // Return cached response if still fresh
    if (cacheable) {
      const entry = this.cache.get(apiPath) as CacheEntry<T> | undefined;
      if (entry && entry.expiresAt > Date.now()) {
        return entry.data;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${this.baseUrl}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;
      const res = await fetch(url, {
        headers: {
          'X-Emby-Token': this.apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      }

      const data = await res.json() as T;

      if (cacheable) {
        this.cache.set(apiPath, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Clear the internal response cache (e.g. after a forced resync) */
  clearCache(): void {
    this.cache.clear();
  }
}
