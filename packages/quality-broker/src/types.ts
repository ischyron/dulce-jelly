export interface BrokerConfig {
  batchSize: number;
  radarr: RadarrConfig;
  openai: OpenAIConfig;
  decisionProfiles: string[];
  autoAssignProfile: string;
  reviseQualityForProfile?: string;
  promptHints?: string;
  reasonTags?: Record<string, string>;
  thresholds?: Thresholds;
  visualGenresHigh?: string[];
  policies?: Policies;
  promptTemplate?: PromptTemplate;
  llmPolicy?: LLMPolicy;
  downgradeQualityProfile?: boolean;
}

export interface RadarrConfig {
  url: string;
  apiKey?: string;
}

export interface OpenAIConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Thresholds {
  criticScoreMin?: number;
  criticHigh?: number;
  criticMid?: number;
  criticLow?: number;
  criticBlock?: number;
  popularityHigh?: number;
  popularityLow?: number;
  allowPopularityTierFallback?: boolean;
  popularityTierFallbackMaxPopularity?: number;
}

export interface ReasoningPolicy {
  maxSentences?: number;
  forbidCurrentTrendsClaims?: boolean;
  allowTimelessCulturalInference?: boolean;
}

export interface Policies {
  reasoning?: ReasoningPolicy;
}

export interface LLMPolicy {
  enabled?: boolean;
  useOnAmbiguousOnly?: boolean;
}

export interface PromptTemplate {
  prelude?: string;
  header?: string;
  constraints?: string;
  inputs?: string;
  popularityTierPolicy?: string;
  groupsAndGenres?: string;
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
  studio?: string;
  runtime?: number;
  ratings?: RadarrRatings;
  genres?: string[];
  popularity?: number;
  tmdbPopularity?: number;
  tmdbVotes?: number;
  keywords?: string[];
  criticScore?: number;
  rottenTomatoesCriticScore?: number;
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
  imdb?: { value?: number; votes?: number };
  tmdb?: { value?: number; votes?: number; voteCount?: number };
  rottenTomatoes?: { value?: number; votes?: number };
  rtCritic?: { value?: number; votes?: number };
  metacritic?: { value?: number };
}

export interface PopularitySignal {
  primarySource?: 'tmdb' | 'imdb';
  primaryScore?: number;
  primaryVotes?: number;
  tmdbScore?: number;
  tmdbVotes?: number;
  imdbScore?: number;
  imdbVotes?: number;
  rawPopularity?: number;
  computedPopularityIndex?: number;
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
  popularityTier?: 'low' | 'mid' | 'high';
}

export interface RunLogEntry {
  radarrMovieId: number;
  title: string;
  imdbId?: string;
  tmdbId?: number;
  popularity?: PopularitySignal;
  popularityTier?: 'low' | 'mid' | 'high';
  metacriticScore?: number;
  rtAudienceScore?: number;
  rtAudienceVotes?: number;
  rtCriticScore?: number;
  rtCriticVotes?: number;
  criticScoreSource?: string;
  currentQuality?: string;
  criticScore?: number;
  keywords?: string[];
  fromProfile: string;
  toProfile: string;
  rulesApplied: string[];
  tagsAdded: string[];
  reasoning: string;
  decisionSource?: 'deterministic_rule' | 'llm';
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
