export interface BrokerConfig {
  batchSize: number;
  radarr: RadarrConfig;
  openai: OpenAIConfig;
  decisionProfiles: string[];
  autoAssignProfile: string;
  promptHints?: string;
  remuxPenalty?: string;
  reasonTags?: string[];
}

export interface RadarrConfig {
  url: string;
  apiKey?: string;
}

export interface OpenAIConfig {
  apiKey?: string;
  model?: string;
}

export interface RadarrTag {
  id: number;
  label: string;
}

export interface RadarrMovie {
  id: number;
  title: string;
  year?: number;
  qualityProfileId: number;
  tags: number[];
  tmdbId?: number;
  imdbId?: string;
  titleSlug?: string;
  path?: string;
  movieFile?: RadarrMovieFile;
  releaseGroup?: string;
  studio?: string;
  runtime?: number;
  ratings?: RadarrRatings;
  genres?: string[];
  popularity?: number;
  tmdbPopularity?: number;
}

export interface RadarrMovieFile {
  quality: {
    quality: {
      id: number;
      name: string;
    };
    revision?: unknown;
  };
  size?: number;
  relativePath?: string;
  mediaInfo?: {
    videoCodec?: string;
    audioCodec?: string;
    videoDynamicRangeType?: string;
    width?: number;
    height?: number;
  };
}

export interface RadarrRatings {
  imdb?: { value?: number };
  tmdb?: { value?: number };
  rottenTomatoes?: { value?: number };
  metacritic?: { value?: number };
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface DecisionInput {
  movie: RadarrMovie;
  profileOptions: string[];
  autoAssignProfile: string;
  configHints?: string;
}

export interface DecisionResult {
  profile: string;
  rules: string[];
  reasoning: string;
}

export interface RunLogEntry {
  radarrMovieId: number;
  title: string;
  imdbId?: string;
  tmdbId?: number;
  popularity?: number;
  currentQuality?: string;
  criticScore?: number;
  releaseGroup?: string;
  fromProfile: string;
  toProfile: string;
  rulesApplied: string[];
  tagsAdded: string[];
  reasoning: string;
  success: boolean;
  error?: string;
}

export interface RunSummary {
  runAt: string;
  batchSize: number;
  processed: number;
  succeeded: number;
  failed: number;
  logPath: string;
}
