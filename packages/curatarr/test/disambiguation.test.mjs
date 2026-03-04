import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { DisambiguationEngine } = await import('../dist/disambiguation/engine.js');

function mkMovie(id, title, year) {
  return {
    id,
    folder_path: `/media/${title} (${year})`,
    folder_name: `${title} (${year})`,
    parsed_title: title,
    parsed_year: year,
    jellyfin_id: null,
    jellyfin_title: null,
    jellyfin_year: null,
    imdb_id: null,
    tmdb_id: null,
    critic_rating: null,
    community_rating: null,
    genres: null,
    overview: null,
    jellyfin_path: null,
    jf_synced_at: null,
    tags: '[]',
    notes: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

describe('Disambiguation with soft-removed duplicate titles', () => {
  test('matches exact title+year when both variants exist', () => {
    const movies = [
      mkMovie(1, 'Les Misérables', 1998),
      mkMovie(2, 'Les Misérables', 2012),
    ];

    const engine = new DisambiguationEngine(movies);
    const result = engine.disambiguate({
      id: 'req-2012',
      title: 'Les Misérables',
      year: 2012,
    });

    assert.equal(result.method, 'title_year');
    assert.equal(result.ambiguous, false);
    assert.equal(result.match?.movieId, 2);
  });

  test('flags year mismatch after soft-removing one title variant', () => {
    // Simulate DB soft-removal from Curatarr index: 2012 entry removed.
    const movies = [
      mkMovie(1, 'Les Misérables', 1998),
    ];

    const engine = new DisambiguationEngine(movies);
    const result = engine.disambiguate({
      id: 'req-2012-after-remove',
      title: 'Les Misérables',
      year: 2012,
    });

    assert.equal(result.method, 'title_only');
    assert.equal(result.ambiguous, true);
    assert.equal(result.ambiguousReason, 'year_mismatch');
    assert.equal(result.match?.movieId, 1);
  });
});
