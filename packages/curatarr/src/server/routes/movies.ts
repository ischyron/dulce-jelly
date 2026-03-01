import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { CuratDb } from '../../db/client.js';
import { JellyfinClient } from '../../jellyfin/client.js';

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.m2ts', '.webm']);

function listFolderContents(folderPath: string): { name: string; size: number; isVideo: boolean }[] {
  try {
    return fs.readdirSync(folderPath).map(name => {
      const full = path.join(folderPath, name);
      let size = 0;
      try { size = fs.statSync(full).size; } catch { /* */ }
      return { name, size, isVideo: VIDEO_EXTS.has(path.extname(name).toLowerCase()) };
    });
  } catch {
    return [];
  }
}

export function makeMoviesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/movies?page=1&limit=50&resolution=1080p&codec=h264&search=title
  app.get('/', (c) => {
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;
    const resolution = c.req.query('resolution');
    const codec = c.req.query('codec');
    const search = c.req.query('search');
    const hdrOnly = c.req.query('hdr') === 'true';
    const noJf = c.req.query('noJf') === 'true';
    const releaseGroup = c.req.query('releaseGroup');
    const sortBy = c.req.query('sortBy') ?? 'quality';
    const sortDir = c.req.query('sortDir') === 'desc' ? 'DESC' : 'ASC';

    // Build a query that joins movies with their primary file
    let sql = `
      SELECT m.*,
             f.id as file_id,
             f.resolution_cat, f.video_codec, f.audio_codec, f.audio_profile,
             f.file_size, f.mb_per_minute, f.release_group, f.hdr_formats,
             f.width, f.height, f.bit_depth, f.dv_profile, f.duration,
             f.scan_error, f.scanned_at, f.verify_status, f.quality_flags
      FROM movies m
      LEFT JOIN files f ON f.movie_id = m.id
        AND f.id = (
          SELECT id FROM files f2 WHERE f2.movie_id = m.id
          ORDER BY f2.file_size DESC LIMIT 1
        )
      WHERE 1=1
    `;
    const bindings: (string | number)[] = [];

    if (resolution) {
      sql += ' AND f.resolution_cat = ?';
      bindings.push(resolution);
    }
    if (codec) {
      sql += ' AND f.video_codec = ?';
      bindings.push(codec);
    }
    if (hdrOnly) {
      sql += " AND f.hdr_formats != '[]'";
    }
    if (noJf) {
      sql += ' AND m.jellyfin_id IS NULL';
    }
    if (releaseGroup) {
      sql += ' AND f.release_group LIKE ?';
      bindings.push(`%${releaseGroup}%`);
    }
    if (search) {
      sql += ' AND (m.parsed_title LIKE ? OR m.jellyfin_title LIKE ? OR m.folder_name LIKE ?)';
      const pat = `%${search}%`;
      bindings.push(pat, pat, pat);
    }

    // Count total for pagination
    const countSql = `SELECT COUNT(*) as n FROM (${sql})`;
    const total = (db.raw().prepare(countSql).get(...bindings) as { n: number }).n;

    // Sort
    const orderMap: Record<string, string> = {
      quality: 'f.resolution_cat ASC, f.mb_per_minute ASC',
      title: `m.parsed_title ${sortDir}`,
      year: `m.parsed_year ${sortDir}`,
      rating: `m.critic_rating ${sortDir}`,
      size: `f.file_size ${sortDir}`,
    };
    sql += ` ORDER BY ${orderMap[sortBy] ?? orderMap['quality']} LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);

    const rows = db.raw().prepare(sql).all(...bindings);

    return c.json({
      total,
      page,
      limit,
      movies: rows,
    });
  });

  // GET /api/movies/:id
  app.get('/:id', (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    const files = db.getFilesForMovie(id);
    return c.json({ ...movie, files });
  });

  // PATCH /api/movies/:id  { tags?: string[]; notes?: string }
  app.patch('/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const body = await c.req.json() as { tags?: unknown; notes?: unknown };

    const tags = Array.isArray(body.tags) ? (body.tags as string[]).filter(t => typeof t === 'string') : undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    const updated = db.updateMovieMeta(id, { tags, notes });
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json({ updated: true });
  });

  // GET /api/movies/:id/folder-contents — list files on disk (for delete confirm)
  app.get('/:id/folder-contents', (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    const contents = listFolderContents(movie.folder_path);
    const hasNonVideo = contents.some(f => !f.isVideo);
    return c.json({ folderPath: movie.folder_path, contents, hasNonVideo });
  });

  // DELETE /api/movies/:id  { mode: 'files' | 'folder' }
  // Deletes video files (or entire folder) from disk, then removes the DB record.
  app.delete('/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);

    const body = await c.req.json() as { mode?: string };
    const mode = body.mode === 'folder' ? 'folder' : 'files';

    const deleted: string[] = [];
    const errors: string[] = [];

    try {
      if (mode === 'folder') {
        fs.rmSync(movie.folder_path, { recursive: true, force: true });
        deleted.push(movie.folder_path);
      } else {
        // Delete only video files in the folder
        const contents = listFolderContents(movie.folder_path);
        for (const f of contents.filter(f => f.isVideo)) {
          const full = path.join(movie.folder_path, f.name);
          try { fs.rmSync(full); deleted.push(full); } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
        }
      }
    } catch (err) {
      return c.json({ error: 'delete_failed', detail: (err as Error).message }, 500);
    }

    // Remove from DB regardless of partial disk errors
    db.deleteMovie(id);

    return c.json({ deleted, errors, mode });
  });

  // POST /api/movies/:id/jf-refresh — re-fetch from Jellyfin using stored jellyfin_id
  app.post('/:id/jf-refresh', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    if (!movie.jellyfin_id) return c.json({ error: 'no_jellyfin_id', detail: 'Movie not synced with Jellyfin yet' }, 422);

    const url = db.getSetting('jellyfinUrl') ?? process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL ?? '';
    const apiKey = db.getSetting('jellyfinApiKey') ?? process.env.JELLYFIN_API_KEY ?? '';
    if (!url || !apiKey) return c.json({ error: 'jellyfin_not_configured' }, 422);

    try {
      const client = new JellyfinClient(url, apiKey);
      const jf = await client.getMovie(movie.jellyfin_id);
      db.enrichMovieById(id, {
        jellyfinId: jf.Id,
        jellyfinTitle: jf.Name,
        jellyfinYear: jf.ProductionYear,
        imdbId: jf.ProviderIds?.Imdb,
        tmdbId: jf.ProviderIds?.Tmdb,
        criticRating: jf.CriticRating,
        communityRating: jf.CommunityRating,
        genres: jf.Genres,
        overview: jf.Overview,
        jellyfinPath: jf.Path,
      });
      const updated = db.getMovieById(id)!;
      return c.json({ updated: true, movie: updated });
    } catch (err) {
      return c.json({ error: 'jellyfin_error', detail: (err as Error).message }, 502);
    }
  });

  return app;
}
