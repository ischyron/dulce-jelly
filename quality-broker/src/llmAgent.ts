import OpenAI from 'openai';

import { BrokerConfig, DecisionInput, DecisionResult } from './types.js';

interface AgentOptions {
  client?: OpenAI;
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
    const model = this.config.openai.model || 'gpt-4-turbo';
    const messageContent = {
      title: movie.title,
      year: movie.year,
      profiles: profileOptions,
      autoAssignProfile,
      imdbRating: movie.ratings?.imdb?.value,
      tmdbRating: movie.ratings?.tmdb?.value,
      tmdbPopularity: movie.tmdbPopularity,
      currentQuality: movie.movieFile?.quality?.quality?.name,
      mediaInfo: movie.movieFile?.mediaInfo,
      genres: movie.genres,
      studio: movie.studio,
      runtime: movie.runtime,
      filename: movie.movieFile?.relativePath,
      remuxPolicy: this.config.remuxPenalty,
      hints: configHints || this.config.promptHints
    };

    const completion = await this.client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a quality broker for Radarr. Choose the best quality profile based on popularity, critic rating, visual richness, and release clues. ' +
            'Use only the provided profile names. Prefer upgrades for rich visuals; keep efficient encodes when quality is marginal. ' +
            'Remux is banned (score -1000, size cap 1MB/min). Do not pick remux or suggest it. ' +
            'Output JSON: {"profile": "<profile name>", "rules": ["rule-name"...], "reasoning": "short"}. Rules must be short slugs.'
        },
        {
          role: 'user',
          content: JSON.stringify(messageContent)
        }
      ],
      temperature: 0.2,
      max_tokens: 400
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty response from LLM');
    let parsed: DecisionResult;
    try {
      parsed = JSON.parse(raw) as DecisionResult;
    } catch (err) {
      throw new Error(`Failed to parse LLM response: ${raw}`);
    }

    if (!parsed.profile || !profileOptions.includes(parsed.profile)) {
      throw new Error(`LLM returned invalid profile: ${parsed.profile}`);
    }

    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];

    return {
      profile: parsed.profile,
      rules,
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  }
}
