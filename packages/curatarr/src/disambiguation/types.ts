/**
 * Disambiguation service — pure interfaces, no DB imports.
 */

export interface DisambiguateRequest {
  id: string;           // caller-provided reference (e.g. Jellyfin item ID)
  title: string;
  year?: number;
  imdbId?: string;
  folderPath?: string;  // optional path hint
}

export interface DisambiguateResult {
  requestId: string;
  match?: {
    movieId: number;
    folderPath: string;
    parsedTitle: string | null;
    parsedYear: number | null;
  };
  confidence: number;   // 0..1
  method: 'path' | 'imdb' | 'title_year' | 'title_only' | 'fuzzy' | 'none';
  ambiguous: boolean;
  ambiguousReason?: 'year_mismatch' | 'title_fuzzy' | 'year_and_title_fuzzy';
}
