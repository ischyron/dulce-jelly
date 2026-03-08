// @ts-check
const { test, expect } = require('@playwright/test');

async function findMovieBySearch(request, q) {
  const res = await request.get(`/api/movies?limit=20&page=1&search=${encodeURIComponent(q)}`);
  expect(res.ok()).toBeTruthy();
  const movies = (await res.json())?.movies ?? [];
  return movies[0] ?? null;
}

test.describe('Jellyfin fixture scenarios', () => {
  test('jf-refresh falls back to search and raises disambiguation on ambiguous candidates', async ({ request }) => {
    const movie = await findMovieBySearch(request, 'Multi Version Film');
    expect(movie).toBeTruthy();

    const refresh = await request.post(`/api/movies/${movie.id}/jf-refresh`);
    expect(refresh.status()).toBe(409);
    const body = await refresh.json();
    expect(body.error).toBe('disambiguation_required');

    const pending = await request.get('/api/disambiguate/pending');
    expect(pending.ok()).toBeTruthy();
    const pendingBody = await pending.json();
    const items = Array.isArray(pendingBody?.items) ? pendingBody.items : [];
    expect(
      items.some((i) => i.matched_movie_id === movie.id && i.reason === 'multiple_jellyfin_candidates'),
    ).toBeTruthy();
  });

  test('jf-sync enriches unsynced movie from fixture server', async ({ request }) => {
    test.setTimeout(60_000);

    const before = await findMovieBySearch(request, 'Legacy Sample');
    expect(before).toBeTruthy();
    expect(before.jellyfin_id).toBeNull();

    const start = await request.post('/api/jf-sync', { data: { resync: true } });
    expect(start.ok()).toBeTruthy();

    let enriched = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
      // Poll until sync writes enrichment.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const row = await findMovieBySearch(request, 'Legacy Sample');
      if (row?.jellyfin_id === 'jf-legacy') {
        enriched = row;
        break;
      }
    }

    expect(enriched).toBeTruthy();
    expect(enriched.jellyfin_title).toBe('Legacy Sample');
  });
});
