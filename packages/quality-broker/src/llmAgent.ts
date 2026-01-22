import OpenAIClient from 'openai';

import { BrokerConfig, DecisionInput, DecisionResult, RadarrMovie } from './types.js';

const MAX_LLM_ATTEMPTS = 3;
const RETRY_DELAYS_SEC = [5, 10, 20, 40];

type PopularityTier = 'low' | 'mid' | 'high';

interface AgentOptions {
  client?: OpenAIClient;
}

function isLowQ(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /(480p|576p|720p)/i.test(currentQuality);
}

function getCriticSignal(movie: RadarrMovie): { score?: number; source?: string } {
  if (typeof movie.criticScore === 'number') return { score: movie.criticScore, source: 'criticScore' };
  if (typeof movie.ratings?.metacritic?.value === 'number') {
    return { score: movie.ratings.metacritic.value, source: 'metacritic' };
  }
  if (typeof movie.ratings?.rtCritic?.value === 'number') {
    return { score: movie.ratings.rtCritic.value, source: 'rtCritic' };
  }
  if (typeof movie.rottenTomatoesCriticScore === 'number') {
    return { score: movie.rottenTomatoesCriticScore, source: 'rtCriticLegacy' };
  }
  return {};
}

function getPopularity(movie: RadarrMovie): number | undefined {
  const p = movie.popularity ?? movie.tmdbPopularity;
  return typeof p === 'number' ? p : undefined;
}

function getTmdbVotes(movie: RadarrMovie): number | undefined {
  const v = movie.ratings?.tmdb?.votes ?? movie.ratings?.tmdb?.voteCount ?? movie.tmdbVotes;
  return typeof v === 'number' ? v : undefined;
}

function buildPopularitySignal(movie: RadarrMovie): {
  primarySource?: 'tmdb' | 'imdb';
  primaryScore?: number;
  primaryVotes?: number;
  tmdbScore?: number;
  tmdbVotes?: number;
  imdbScore?: number;
  imdbVotes?: number;
  rawPopularity?: number;
  computedPopularityIndex?: number;
} {
  const tmdbScore = movie.ratings?.tmdb?.value;
  const tmdbVotes = getTmdbVotes(movie);
  const imdbScore = movie.ratings?.imdb?.value;
  const imdbVotes = movie.ratings?.imdb?.votes;
  const rawPopularity = getPopularity(movie);

  let primarySource: 'tmdb' | 'imdb' | undefined;
  if (typeof tmdbVotes === 'number' && typeof imdbVotes === 'number') {
    primarySource = tmdbVotes >= imdbVotes ? 'tmdb' : 'imdb';
  } else if (typeof tmdbVotes === 'number') {
    primarySource = 'tmdb';
  } else if (typeof imdbVotes === 'number') {
    primarySource = 'imdb';
  }

  const primaryScore = primarySource === 'tmdb' ? tmdbScore : primarySource === 'imdb' ? imdbScore : undefined;
  const primaryVotes = primarySource === 'tmdb' ? tmdbVotes : primarySource === 'imdb' ? imdbVotes : undefined;
  const computedPopularityIndex = computePopularityIndex(primaryVotes);

  return {
    primarySource,
    primaryScore: typeof primaryScore === 'number' ? primaryScore : undefined,
    primaryVotes: typeof primaryVotes === 'number' ? primaryVotes : undefined,
    tmdbScore: typeof tmdbScore === 'number' ? tmdbScore : undefined,
    tmdbVotes: typeof tmdbVotes === 'number' ? tmdbVotes : undefined,
    imdbScore: typeof imdbScore === 'number' ? imdbScore : undefined,
    imdbVotes: typeof imdbVotes === 'number' ? imdbVotes : undefined,
    rawPopularity: typeof rawPopularity === 'number' ? rawPopularity : undefined,
    computedPopularityIndex
  };
}

function computePopularityIndex(votes?: number): number | undefined {
  if (typeof votes !== 'number' || votes <= 0) return undefined;
  const logMin = 3; // 1k votes
  const logMax = 6; // 1M votes
  const normalized = ((Math.log10(votes) - logMin) / (logMax - logMin)) * 100;
  const clamped = Math.max(0, Math.min(100, normalized));
  return Math.round(clamped * 10) / 10;
}

function computePopularityTier(value: number | undefined, low: number | undefined, high: number | undefined): PopularityTier | undefined {
  if (typeof value !== 'number' || typeof low !== 'number' || typeof high !== 'number') return undefined;
  if (value <= low) return 'low';
  if (value >= high) return 'high';
  return 'mid';
}

function coercePopularityTier(v: unknown): PopularityTier | undefined {
  if (v === 'low' || v === 'mid' || v === 'high') return v;
  return undefined;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function matchVisualGenres(genres: string[], visualGenresHigh: string[]): string[] {
  if (!genres.length || !visualGenresHigh.length) return [];
  const set = new Set(visualGenresHigh.map(normalizeName));
  return genres.filter((g) => set.has(normalizeName(g)));
}

function computeVisualScore(matches: string[]): number {
  if (!matches.length) return 0;
  const weights: Record<string, number> = {
    action: 3,
    war: 3,
    animation: 2,
    'sci-fi': 2,
    'sci fi': 2,
    scifi: 2,
    fantasy: 2,
    adventure: 1,
    thriller: 1
  };
  const total = matches.reduce((sum, g) => {
    const key = normalizeName(g);
    return sum + (weights[key] ?? 1);
  }, 0);
  return Math.min(6, total);
}

function is4kQuality(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /2160p/i.test(currentQuality);
}

function truncateSentences(text: string, maxSentences: number): string {
  const cleaned = text.trim();
  if (!cleaned || maxSentences <= 0) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
  if (sentences.length <= maxSentences) return cleaned;
  return sentences.slice(0, maxSentences).join(' ').trim();
}

function containsTrendClaims(text: string): boolean {
  return /\b(current|currently|trending|recent|now|today|this year|latest)\b/i.test(text);
}

function supportsJsonSchema(model: string): boolean {
  return /(gpt-4o|gpt-4\.1|o1|o3)/i.test(model);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number): number {
  const base = RETRY_DELAYS_SEC[Math.max(0, Math.min(RETRY_DELAYS_SEC.length - 1, attempt - 1))];
  return Math.min(base, 60) * 1000;
}

function shouldRetryStatus(status?: number): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status <= 599);
}

function applyTemplate(s: string, vars: Record<string, string>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function buildSystemPrompt(config: BrokerConfig): string {
  const reasons = Object.keys(config.reasonTags || {});
  const thresholds = config.thresholds || {};
  const policies = config.policies || {};
  const tmpl = config.promptTemplate || {};

  const visualGenres = (config.visualGenresHigh || []) as string[];

  const maxSent = policies.reasoning?.maxSentences ?? 2;

  const vars: Record<string, string> = {
    allowedReasons: JSON.stringify(reasons),
    allowedProfiles: JSON.stringify(config.decisionProfiles || []),
    visualGenresHigh: JSON.stringify(visualGenres),
    maxSentences: String(maxSent),
    thresholds: JSON.stringify(thresholds)
  };

  const parts = [
    tmpl.prelude,
    tmpl.header,
    tmpl.constraints,
    tmpl.inputs,
    tmpl.popularityTierPolicy,
    tmpl.groupsAndGenres,
  ]
    .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => applyTemplate(p, vars));

  // Add one dynamic line from YAML policy for reasoning length
  parts.push(`reasoning must be <= ${maxSent} sentences.`);

  return parts.join('\n\n');
}

export class LLMAgent {
  private readonly client: OpenAIClient;
  private readonly config: BrokerConfig;

  constructor(config: BrokerConfig, opts: AgentOptions = {}) {
    const apiKey = config.openai.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is required.');
    this.client = opts.client || new OpenAIClient({ apiKey });
    this.config = config;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const { movie, profileOptions, autoAssignProfile, configHints } = input;

    const openaiCfg = this.config.openai || {};
    const model = openaiCfg.model || 'gpt-4-turbo';
    const temperature = typeof openaiCfg.temperature === 'number' ? openaiCfg.temperature : 0.15;
    const maxTokens = typeof openaiCfg.maxTokens === 'number' ? openaiCfg.maxTokens : 320;

    const reasonMap = this.config.reasonTags || {};
    const allowedReasons = Object.keys(reasonMap);

    const thresholds = this.config.thresholds || {};
    const popTierMax: number =
      typeof thresholds.popularityTierFallbackMaxPopularity === 'number'
        ? thresholds.popularityTierFallbackMaxPopularity
        : 2;
    const allowPopularityTierFallback: boolean = thresholds.allowPopularityTierFallback !== false;

    const criticSignal = getCriticSignal(movie);
    const criticScore = criticSignal.score;
    const popularitySignal = buildPopularitySignal(movie);
    const popularity = getPopularity(movie);
    const popularityVotes = popularitySignal.primaryVotes;
    const computedPopularityIndex = popularitySignal.computedPopularityIndex;
    const popularityForThreshold =
      typeof computedPopularityIndex === 'number'
        ? computedPopularityIndex
        : typeof popularity === 'number'
          ? popularity
          : undefined;
    const popularityForTier =
      typeof computedPopularityIndex === 'number'
        ? computedPopularityIndex
        : typeof popularity === 'number'
          ? popularity
          : undefined;
    const popularityTierComputed = computePopularityTier(
      popularityForTier,
      thresholds.popularityLow,
      thresholds.popularityHigh
    );

    const currentQuality: string | undefined = movie.movieFile?.quality?.quality?.name;
    const lowq = isLowQ(currentQuality);
    const visualMatches = matchVisualGenres(Array.isArray(movie.genres) ? movie.genres : [], this.config.visualGenresHigh || []);
    const visualScore = computeVisualScore(visualMatches);
    // Count matched genres to quantify visual payoff demand from genre signals.
    const visualQualityDemandByGenreMatches = visualMatches.length;
    const currentIs4k = is4kQuality(currentQuality);

    const weakPopularitySignal = popularityForTier == null || popularityForTier <= popTierMax;
    const weakCriticSignal = criticScore == null;
    const allowPopularityTier = allowPopularityTierFallback && weakPopularitySignal && weakCriticSignal;

    const messageContent = {
      title: movie.title,
      year: movie.year,
      studio: movie.studio,
      genres: Array.isArray(movie.genres) ? movie.genres : [],
      runtime: movie.runtime,

      profiles: profileOptions,
      autoAssignProfile,

      allowedReasons,
      reasonDescriptions: reasonMap,

      criticScore: criticScore ?? null,
      criticScoreSource: criticSignal.source ?? null,
      popularity: popularitySignal,
      popularityTier: popularityTierComputed ?? null,
      metacriticScore: movie.ratings?.metacritic?.value ?? null,
      rtAudienceScore: movie.ratings?.rottenTomatoes?.value ?? null,
      rtAudienceVotes: movie.ratings?.rottenTomatoes?.votes ?? null,
      rtCriticScore: movie.ratings?.rtCritic?.value ?? null,
      rtCriticVotes: movie.ratings?.rtCritic?.votes ?? null,

      currentQuality: currentQuality ?? null,
      mediaInfo: movie.movieFile?.mediaInfo ?? null,
      filename: movie.movieFile?.relativePath ?? null,

      lowq,

      thresholds,
      visualGenresHigh: this.config.visualGenresHigh || [],
      policies: this.config.policies || {},

      signalSummary: {
        criticScoreStrong:
          typeof criticScore === 'number' && typeof thresholds.criticScoreMin === 'number'
            ? criticScore >= thresholds.criticScoreMin
            : null,
        popularityHigh:
          typeof popularityForThreshold === 'number' && typeof thresholds.popularityHigh === 'number'
            ? popularityForThreshold >= thresholds.popularityHigh
            : null,
        popularityLow:
          typeof popularityForThreshold === 'number' && typeof thresholds.popularityLow === 'number'
            ? popularityForThreshold <= thresholds.popularityLow
            : null,
        popularityTier: popularityTierComputed ?? null,
        computedPopularityIndex: computedPopularityIndex ?? null,
        visualGenreMatches: visualMatches,
        visualScore,
        visualQualityDemandByGenreMatches,
        currentIs4k,
        currentQuality: currentQuality ?? null,
        lowq
      },

      hints: configHints || this.config.promptHints || '',

      popularityTierPolicy: {
        allow: allowPopularityTier,
        meaning:
          'If allow=true, output popularityTier as low|mid|high using timeless archetype inference only. No current trend claims.'
      }
    };

    const systemPrompt = buildSystemPrompt(this.config);

    // Debug: log system prompt on first movie only (avoid spam)
    if (process.env.DEBUG_LLM_PROMPT === 'true') {
      console.log('=== LLM System Prompt ===');
      console.log(systemPrompt);
      console.log('=== Message Content Sample ===');
      console.log(JSON.stringify(messageContent, null, 2).substring(0, 500));
      console.log('========================');
    }

    const schemaProperties: Record<string, unknown> = {
      profile: { type: 'string', enum: profileOptions },
      rules: {
        type: 'array',
        items: { type: 'string', enum: allowedReasons },
        minItems: 1
      },
      reasoning: { type: 'string', minLength: 1 }
    };
    const requiredKeys = ['profile', 'rules', 'reasoning'];
    if (allowPopularityTier) {
      schemaProperties.popularityTier = { type: 'string', enum: ['low', 'mid', 'high'] };
      requiredKeys.push('popularityTier');
    }

    const schemaResponseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'quality_broker_decision',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: requiredKeys,
          properties: schemaProperties
        }
      }
    } as const;

    type LLMResponse = {
      profile?: unknown;
      rules?: unknown;
      reasoning?: unknown;
      popularityTier?: unknown;
      reasonDescription?: unknown;
    };

    let parsed: LLMResponse | null = null;
    let lastError: Error | null = null;
    let lastRaw: string = '';
    let useJsonSchema = supportsJsonSchema(model);

    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt += 1) {
      let completion;
      try {
        completion = await this.client.chat.completions.create({
          model,
          response_format: useJsonSchema ? schemaResponseFormat : { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(messageContent) }
          ],
          temperature,
          max_tokens: maxTokens
        });
      } catch (err) {
        const message = (err as Error).message || String(err);
        const status = (err as { status?: number })?.status;
        if (shouldRetryStatus(status)) {
          const delayMs = getRetryDelayMs(attempt);
          console.warn(`LLM request failed with ${status}. Retrying in ${Math.round(delayMs / 1000)}s...`);
          await sleep(delayMs);
          continue;
        }
        if (useJsonSchema && /json_schema/i.test(message)) {
          useJsonSchema = false;
          lastError = new Error('Model does not support json_schema response_format; retrying with json_object.');
          continue;
        }
        throw err;
      }

      const raw = completion?.choices?.[0]?.message?.content;
      lastRaw = raw || '';

      if (!raw) {
        lastError = new Error(`Empty response from LLM (attempt ${attempt}/${MAX_LLM_ATTEMPTS})`);
        continue;
      }

      try {
        parsed = JSON.parse(raw) as LLMResponse;
        lastError = null;
        break;
      } catch (parseErr) {
        console.error(`[Attempt ${attempt}/${MAX_LLM_ATTEMPTS}] Failed to parse LLM response:`, raw.substring(0, 200));
        lastError = new Error(`Failed to parse LLM response (attempt ${attempt}/${MAX_LLM_ATTEMPTS}): ${raw.substring(0, 100)}`);
      }
    }

    if (lastError || !parsed) {
      throw new Error(`${lastError?.message || 'LLM parse failed'}. Last response: ${lastRaw.substring(0, 150)}`);
    }

    // Validate profile, fallback to first allowed if invalid
    let returnedProfile = typeof parsed.profile === 'string' ? parsed.profile : '';
    if (!returnedProfile || !profileOptions.includes(returnedProfile)) {
      returnedProfile = profileOptions[0] || '';
    }
    if (!returnedProfile) {
      throw new Error('LLM returned no valid profile and no fallback available.');
    }

    // Validate rules
    const rulesRaw = Array.isArray(parsed.rules) ? parsed.rules : [];
    const allowed = new Set(allowedReasons);
    const rules = rulesRaw
      .filter((r: unknown): r is string => typeof r === 'string' && r.trim().length > 0)
      .filter((r: string) => allowed.has(r));
    const finalRules = rules.length ? rules : (allowedReasons.length ? [allowedReasons[0]] : []);

    // Final validation for reasoning with fallback
    const maxSentences = this.config.policies?.reasoning?.maxSentences ?? 2;
    const forbidTrends = this.config.policies?.reasoning?.forbidCurrentTrendsClaims !== false;
    const profileName = returnedProfile || 'HD';
    const fallbackParts: string[] = [];
    if (finalRules.includes('lowq') && currentQuality) {
      fallbackParts.push(`current quality is ${currentQuality}`);
    }
    if (finalRules.includes('crit') && typeof criticScore === 'number') {
      const source = criticSignal.source ? ` (${criticSignal.source})` : '';
      fallbackParts.push(`critic score${source} ${criticScore}`);
    }
    if (finalRules.includes('pop') && (typeof popularity === 'number' || popularitySignal.primaryScore != null)) {
      const score = popularitySignal.primaryScore ?? popularity;
      const source = popularitySignal.primarySource ? ` (${popularitySignal.primarySource})` : '';
      const voteNote = typeof popularityVotes === 'number' ? ` with ${popularityVotes} votes` : '';
      fallbackParts.push(`popularity${source} ${score}${voteNote}`);
    }
    if (finalRules.includes('vis') && visualMatches.length) {
      fallbackParts.push(`genres ${visualMatches.join(', ')}`);
    }
    // visual richness is genre-based; avoid using mediaInfo HDR/DV as a signal
    if (finalRules.includes('weak')) fallbackParts.push('limited signal');
    if (finalRules.includes('mix')) fallbackParts.push('mixed signals');

    const fallbackReasoning = fallbackParts.length
      ? `Chose ${profileName} because ${fallbackParts.join('; ')}.`
      : `Chose ${profileName} due to limited signal in provided metadata.`;

    let reasoning = '';
    if (typeof parsed.reasoning === 'string' && parsed.reasoning.trim()) {
      reasoning = parsed.reasoning.trim();
    } else if (typeof parsed.reasonDescription === 'string' && parsed.reasonDescription.trim()) {
      reasoning = parsed.reasonDescription.trim();
    } else {
      reasoning = fallbackReasoning;
      console.warn(`Warning: LLM did not provide reasoning for ${movie.title}. Using fallback.`);
    }

    if (forbidTrends && containsTrendClaims(reasoning)) {
      reasoning = fallbackReasoning;
    }

    const groundingTokens = [
      criticScore != null ? String(criticScore) : null,
      popularity != null ? String(popularity) : null,
      popularitySignal.primaryScore != null ? String(popularitySignal.primaryScore) : null,
      popularityVotes != null ? String(popularityVotes) : null,
      movie.ratings?.rottenTomatoes?.value != null ? String(movie.ratings.rottenTomatoes.value) : null,
      movie.ratings?.metacritic?.value != null ? String(movie.ratings.metacritic.value) : null,
      currentQuality ?? null,
      ...visualMatches
    ].filter((v): v is string => Boolean(v));
    const hasGrounding =
      groundingTokens.some((token) => reasoning.toLowerCase().includes(token.toLowerCase())) ||
      /\b(critic|metacritic|rotten|audience|popularity|vote|quality|genre|lowq|imdb|tmdb)\b/i.test(reasoning);

    if (!hasGrounding) {
      reasoning = fallbackReasoning;
    }

    reasoning = truncateSentences(reasoning, maxSentences);

    const popularityTier = allowPopularityTier ? coercePopularityTier(parsed.popularityTier) : undefined;

    return {
      profile: returnedProfile,
      rules: finalRules,
      reasoning,
      ...(popularityTier ? { popularityTier } : {})
    } as DecisionResult;
  }
}
