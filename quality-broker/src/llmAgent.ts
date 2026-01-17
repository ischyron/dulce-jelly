import OpenAI from 'openai';
import { BrokerConfig, DecisionInput, DecisionResult } from './types.js';

const MAX_LLM_ATTEMPTS = 2;

type PopularityTier = 'low' | 'mid' | 'high';

interface AgentOptions {
  client?: OpenAI;
}

function normalizeReleaseGroup(g?: string): string | undefined {
  if (!g) return undefined;
  return g.replace(/\s+/g, '').trim();
}

function isLowQ(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /(480p|576p|720p)/i.test(currentQuality);
}

function getCriticScore(movie: any): number | undefined {
  return (
    movie.criticScore ??
    movie.rottenTomatoesCriticScore ??
    movie.ratings?.rottenTomatoes?.value ??
    movie.ratings?.rtCritic?.value ??
    undefined
  );
}

function getPopularity(movie: any): number | undefined {
  const p = movie.popularity ?? movie.tmdbPopularity;
  return typeof p === 'number' ? p : undefined;
}

function getTmdbVotes(movie: any): number | undefined {
  const v = movie.ratings?.tmdb?.votes ?? movie.ratings?.tmdb?.voteCount ?? movie.tmdbVotes;
  return typeof v === 'number' ? v : undefined;
}

function coercePopularityTier(v: unknown): PopularityTier | undefined {
  if (v === 'low' || v === 'mid' || v === 'high') return v;
  return undefined;
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
  const thresholds = (config as any).thresholds || {};
  const policies = (config as any).policies || {};
  const tmpl = (config as any).promptTemplate || {};

  const penalize = ((config as any).releaseGroups?.penalizeIfHighQuality4k || []) as string[];
  const prefer = ((config as any).releaseGroups?.preferIfHighQuality4k || []) as string[];
  const visualGenres = ((config as any).visualGenresHigh || []) as string[];

  const remuxPolicyMessage = policies.remux?.message ? String(policies.remux.message) : '';
  const maxSent = policies.reasoning?.maxSentences ?? 2;

  const vars: Record<string, string> = {
    allowedReasons: JSON.stringify(reasons),
    penalizeGroups: JSON.stringify(penalize),
    preferGroups: JSON.stringify(prefer),
    visualGenresHigh: JSON.stringify(visualGenres),
    remuxPolicyMessage,
    maxSentences: String(maxSent)
  };

  const parts = [
    'Respond ONLY with JSON.',
    tmpl.header,
    tmpl.constraints,
    `allowedReasons = ${JSON.stringify(reasons)}`,
    `allowedProfiles = ${JSON.stringify(config.decisionProfiles || [])}`,
    `thresholds = ${JSON.stringify(thresholds)}`,
    tmpl.inputs,
    tmpl.popularityTierPolicy,
    tmpl.groupsAndGenres ? applyTemplate(String(tmpl.groupsAndGenres), vars) : '',
    tmpl.remuxPolicy ? applyTemplate(String(tmpl.remuxPolicy), vars) : ''
  ]
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .map((p) => applyTemplate(String(p), vars));

  // Add one dynamic line from YAML policy for reasoning length
  parts.push(`reasoning must be <= ${maxSent} sentences.`);

  return parts.join('\n\n');
}

export class LLMAgent {
  private readonly client: OpenAI;
  private readonly config: BrokerConfig;

  constructor(config: BrokerConfig, opts: AgentOptions = {}) {
    const apiKey = config.openai.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is required.');
    this.client = opts.client || new OpenAI({ apiKey });
    this.config = config;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const { movie, profileOptions, autoAssignProfile, configHints } = input;

    const openaiCfg = (this.config as any).openai || {};
    const model = openaiCfg.model || 'gpt-4-turbo';
    const temperature = typeof openaiCfg.temperature === 'number' ? openaiCfg.temperature : 0.15;
    const maxTokens = typeof openaiCfg.maxTokens === 'number' ? openaiCfg.maxTokens : 320;

    const reasonMap = this.config.reasonTags || {};
    const allowedReasons = Object.keys(reasonMap);

    const thresholds = (this.config as any).thresholds || {};
    const popTierMax: number =
      typeof thresholds.popularityTierFallbackMaxPopularity === 'number'
        ? thresholds.popularityTierFallbackMaxPopularity
        : 2;
    const allowPopularityTierFallback: boolean = thresholds.allowPopularityTierFallback !== false;

    const criticScore = getCriticScore(movie);
    const popularity = getPopularity(movie);
    const tmdbVotes = getTmdbVotes(movie);

    const currentQuality: string | undefined = movie.movieFile?.quality?.quality?.name;
    const lowq = isLowQ(currentQuality);
    const releaseGroup = normalizeReleaseGroup(movie.releaseGroup);

    const weakPopularitySignal = popularity == null || popularity <= popTierMax;
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
      popularity: popularity ?? null,
      tmdbVotes: tmdbVotes ?? null,

      currentQuality: currentQuality ?? null,
      mediaInfo: movie.movieFile?.mediaInfo ?? null,
      filename: movie.movieFile?.relativePath ?? null,

      releaseGroup: releaseGroup ?? null,
      lowq,

      thresholds,
      releaseGroups: (this.config as any).releaseGroups || {},
      visualGenresHigh: (this.config as any).visualGenresHigh || [],
      policies: (this.config as any).policies || {},

      hints: configHints || this.config.promptHints || '',

      popularityTierPolicy: {
        allow: allowPopularityTier,
        meaning:
          'If allow=true, output popularityTier as low|mid|high using timeless archetype inference only. No current trend claims.'
      }
    };

    const systemPrompt = buildSystemPrompt(this.config);

    let parsed: any;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt += 1) {
      const completion = await this.client.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(messageContent) }
        ],
        temperature,
        max_tokens: maxTokens
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        lastError = new Error('Empty response from LLM');
        continue;
      }

      try {
        parsed = JSON.parse(raw);
        if (!parsed.reasoning || typeof parsed.reasoning !== 'string' || !parsed.reasoning.trim()) {
          lastError = new Error('LLM returned no reasoning.');
          continue;
        }
        // success
        lastError = null;
        break;
      } catch {
        lastError = new Error(`Failed to parse LLM response: ${raw}`);
      }
    }

    if (lastError) {
      throw lastError;
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

    if (typeof parsed.reasoning !== 'string' || !parsed.reasoning.trim()) {
      throw new Error('LLM returned no reasoning.');
    }
    const reasoning = parsed.reasoning.trim();

    const popularityTier = allowPopularityTier ? coercePopularityTier(parsed.popularityTier) : undefined;

    return {
      profile: returnedProfile,
      rules: finalRules,
      reasoning,
      ...(popularityTier ? { popularityTier } : {})
    } as DecisionResult;
  }
}
