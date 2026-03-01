/**
 * DisambiguationEngine — pure, no DB writes, no network.
 * Constructed with a snapshot of MovieRow[].
 */

import type { MovieRow } from '../db/client.js';
import type { DisambiguateRequest, DisambiguateResult } from './types.js';
import {
  strategyPath,
  strategyImdb,
  strategyTitleYear,
  strategyTitleOnly,
  strategyFuzzy,
} from './strategies.js';

const STRATEGIES = [
  strategyPath,
  strategyImdb,
  strategyTitleYear,
  strategyTitleOnly,
  strategyFuzzy,
];

export class DisambiguationEngine {
  constructor(private dbMovies: MovieRow[]) {}

  disambiguate(req: DisambiguateRequest): DisambiguateResult {
    for (const strategy of STRATEGIES) {
      const result = strategy(req, this.dbMovies);
      if (result) return result;
    }
    return {
      requestId: req.id,
      confidence: 0,
      method: 'none',
      ambiguous: false,
    };
  }

  disambiguateBatch(reqs: DisambiguateRequest[]): DisambiguateResult[] {
    return reqs.map(r => this.disambiguate(r));
  }
}
