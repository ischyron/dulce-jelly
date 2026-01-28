/**
 * Jellyfin API client
 * Fetches library items in batches with error resilience
 */

import type { CuratarrConfig, JellyfinItem, JellyfinLibrary } from '../shared/types.js';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 30000;

interface FetchOptions {
  batchSize?: number;
  timeoutMs?: number;
  onProgress?: (fetched: number, total: number) => void;
}

export class JellyfinClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: CuratarrConfig) {
    this.baseUrl = config.jellyfin.url.replace(/\/$/, '');
    this.apiKey = config.jellyfin.apiKey;
  }

  /**
   * Get all libraries (views)
   */
  async getLibraries(): Promise<JellyfinLibrary[]> {
    const response = await this.fetch('/Library/VirtualFolders');
    const data = await response.json() as Array<{
      ItemId: string;
      Name: string;
      CollectionType: string;
      Locations: string[];
    }>;

    return data.map(lib => ({
      Id: lib.ItemId,
      Name: lib.Name,
      CollectionType: (lib.CollectionType as JellyfinLibrary['CollectionType']) || 'unknown',
      Path: lib.Locations[0] || '',
    }));
  }

  /**
   * Get all items from a library with batched fetching
   * Resilient to errors - continues with next batch on failure
   */
  async getLibraryItems(
    libraryId: string,
    type: 'Movie' | 'Series' | 'Episode',
    options: FetchOptions = {}
  ): Promise<{ items: JellyfinItem[]; errors: string[] }> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const items: JellyfinItem[] = [];
    const errors: string[] = [];

    // First, get total count
    let totalCount: number;
    try {
      const countResponse = await this.fetch(
        `/Items?ParentId=${libraryId}&IncludeItemTypes=${type}&Recursive=true&Limit=0`
      );
      const countData = await countResponse.json() as { TotalRecordCount: number };
      totalCount = countData.TotalRecordCount;
    } catch (err) {
      errors.push(`Failed to get item count: ${(err as Error).message}`);
      return { items, errors };
    }

    // Fetch in batches
    let startIndex = 0;
    while (startIndex < totalCount) {
      try {
        const response = await this.fetch(
          `/Items?ParentId=${libraryId}&IncludeItemTypes=${type}&Recursive=true` +
          `&StartIndex=${startIndex}&Limit=${batchSize}` +
          `&Fields=Path,ProviderIds,MediaSources`
        );

        const data = await response.json() as { Items: JellyfinItem[] };
        items.push(...data.Items);

        if (options.onProgress) {
          options.onProgress(items.length, totalCount);
        }
      } catch (err) {
        errors.push(`Batch ${startIndex}-${startIndex + batchSize} failed: ${(err as Error).message}`);
        // Continue with next batch despite error
      }

      startIndex += batchSize;
    }

    return { items, errors };
  }

  /**
   * Get all movies from all movie libraries
   */
  async getAllMovies(options: FetchOptions = {}): Promise<{ items: JellyfinItem[]; errors: string[] }> {
    const libraries = await this.getLibraries();
    const movieLibraries = libraries.filter(lib => lib.CollectionType === 'movies');

    const allItems: JellyfinItem[] = [];
    const allErrors: string[] = [];

    for (const library of movieLibraries) {
      const { items, errors } = await this.getLibraryItems(library.Id, 'Movie', options);
      allItems.push(...items);
      allErrors.push(...errors);
    }

    return { items: allItems, errors: allErrors };
  }

  /**
   * Fetch with timeout and auth
   */
  private async fetch(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'X-Emby-Token': this.apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
