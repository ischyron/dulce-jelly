import path from 'path';

import { BrokerConfig, QualityProfile, RadarrMovie, RadarrTag } from './types.js';

interface RequestOptions extends RequestInit {
  query?: Record<string, string | number | undefined>;
}

export class RadarrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: BrokerConfig) {
    this.baseUrl = config.radarr.url.replace(/\/$/, '');
    const apiKey = config.radarr.apiKey || process.env.RADARR_API_KEY;
    if (!apiKey) throw new Error('Radarr API key missing. Set radarr.apiKey or RADARR_API_KEY.');
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path.join('/', endpoint));
    if (opts.query) {
      Object.entries(opts.query).forEach(([k, v]) => {
        if (v !== undefined) url.searchParams.append(k, String(v));
      });
    }
    try {
      const res = await fetch(url.toString(), {
        ...opts,
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Radarr request failed ${res.status}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      const reason = (err as Error).message || String(err);
      throw new Error(`Radarr request to ${url.toString()} failed: ${reason}`);
    }
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request<QualityProfile[]>('/api/v3/qualityProfile');
  }

  async getTags(): Promise<RadarrTag[]> {
    return this.request<RadarrTag[]>('/api/v3/tag');
  }

  async ensureTag(label: string, existing: RadarrTag[]): Promise<RadarrTag> {
    const found = existing.find((t) => t.label === label);
    if (found) return found;
    const created = await this.request<RadarrTag>('/api/v3/tag', {
      method: 'POST',
      body: JSON.stringify({ label })
    });
    existing.push(created);
    return created;
  }

  async getMovies(): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>('/api/v3/movie', {
      query: { includeMovieFile: 'true' }
    });
  }

  async updateMovie(movie: RadarrMovie): Promise<void> {
    await this.request(`/api/v3/movie/${movie.id}`, {
      method: 'PUT',
      body: JSON.stringify(movie)
    });
  }
}
