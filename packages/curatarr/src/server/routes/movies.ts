import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { JellyfinClient, type JfMovie } from '../../integrations/jellyfin/client.js';
import { extractReleaseGroup } from '../../scanner/ffprobe.js';
import { movieLibraryPaths, parseLibraryRootsJson } from '../../shared/libraryRoots.js';

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.m2ts', '.webm']);

function listFolderContents(folderPath: string): { name: string; size: number; isVideo: boolean }[] {
  try {
    return fs.readdirSync(folderPath).map((name) => {
      const full = path.join(folderPath, name);
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        /* */
      }
      return { name, size, isVideo: VIDEO_EXTS.has(path.extname(name).toLowerCase()) };
    });
  } catch {
    return [];
  }
}

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return t ? t : null;
}

export function makeMoviesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  function normTitle(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function flagDisambiguationNeeded(
    movieId: number,
    inputTitle: string,
    inputYear: number | null,
    reason: string,
  ): void {
    db.raw()
      .prepare(`
      INSERT INTO disambiguation_log
        (job_id, request_id, input_title, input_year, method, confidence,
         matched_movie_id, ambiguous, reason, reviewed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `)
      .run(
        `jf-refresh-${movieId}`,
        `jf-refresh-${movieId}-${Date.now()}`,
        inputTitle,
        inputYear,
        'jf_refresh',
        null,
        movieId,
        1,
        reason,
      );
  }

  function validateJellyfinCandidateAgainstFolder(
    movie: { parsed_title: string | null; folder_name: string; parsed_year: number | null },
    jf: { Name?: string; ProductionYear?: number },
  ): { ok: boolean; reason?: string; detail?: string } {
    const expectedTitle = movie.parsed_title ?? movie.folder_name;
    const expectedYear = movie.parsed_year;
    const jfTitle = jf.Name ?? '';
    const titleMatch = normTitle(expectedTitle) === normTitle(jfTitle);
    const yearMatch = expectedYear == null || jf.ProductionYear == null || expectedYear === jf.ProductionYear;

    if (!titleMatch || !yearMatch) {
      const detail = `Folder parse "${expectedTitle}${expectedYear ? ` (${expectedYear})` : ''}" does not match Jellyfin "${jfTitle}${jf.ProductionYear ? ` (${jf.ProductionYear})` : ''}".`;
      return { ok: false, reason: 'filename_title_year_mismatch', detail };
    }
    return { ok: true };
  }

  // GET /api/movies?page=1&limit=50&resolution=1080p&codec=h264&search=title
  app.get('/', (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
    const showAll = c.req.query('showAll') === 'true' || c.req.query('all') === '1';
    const limit = showAll ? 100000 : Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '50', 10)));
    const offset = showAll ? 0 : (page - 1) * limit;
    const resolution = c.req.query('resolution');
    const codec = c.req.query('codec');
    const search = c.req.query('search');
    const hdrOnly = c.req.query('hdr') === 'true';
    const dvOnly = c.req.query('dv') === 'true';
    const legacyOnly = c.req.query('legacy') === 'true';
    const noJf = c.req.query('noJf') === 'true';
    const multiOnly = c.req.query('multi') === 'true';
    const audioFormat = (c.req.query('audioFormat') ?? '').toLowerCase().trim();
    const audioLayout = (c.req.query('audioLayout') ?? '').toLowerCase().trim();
    const releaseGroup = c.req.query('releaseGroup');
    const genre = c.req.query('genre');
    const genres = (genre ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const tagsQuery = c.req.query('tags');
    const sortBy = c.req.query('sortBy') ?? 'title';
    const sortDir = c.req.query('sortDir') === 'desc' ? 'DESC' : 'ASC';
    const searchNorm = (search ?? '').toLowerCase().trim();
    const tags = (tagsQuery ?? '')
      .split(',')
      .map((s) => normalizeTag(s))
      .filter((t): t is string => !!t);

    // Build a query that joins movies with their primary file
    let sql = `
      SELECT m.*,
             f.id as file_id,
             f.filename as file_name,
             f.resolution_cat, f.video_codec, f.audio_codec, f.audio_profile,
             f.audio_channels, f.audio_layout,
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
    if (dvOnly) {
      sql += " AND f.hdr_formats LIKE '%DolbyVision%'";
    }
    if (legacyOnly) {
      sql += " AND COALESCE(f.video_codec,'') IN ('mpeg4','mpeg2video','msmpeg4v3')";
    }
    if (audioLayout) {
      if (audioLayout === 'stereo') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) = 'stereo' OR COALESCE(f.audio_channels, 0) = 2)";
      } else if (audioLayout === '5.1') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) LIKE '%5.1%' OR COALESCE(f.audio_channels, 0) = 6)";
      } else if (audioLayout === '7.1') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) LIKE '%7.1%' OR COALESCE(f.audio_channels, 0) = 8)";
      }
    }
    if (audioFormat) {
      if (audioFormat === 'ddp') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) = 'eac3' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%dolby digital plus%' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%ddp%')";
      } else if (audioFormat === 'truehd') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) = 'truehd' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%truehd%')";
      } else if (audioFormat === 'dts') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) LIKE 'dts%' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%dts%')";
      } else if (audioFormat === 'aac') {
        sql += " AND LOWER(COALESCE(f.audio_codec,'')) = 'aac'";
      } else if (audioFormat === 'ac3') {
        sql += " AND LOWER(COALESCE(f.audio_codec,'')) = 'ac3'";
      } else if (audioFormat === 'atmos') {
        sql += " AND LOWER(COALESCE(f.audio_profile,'')) LIKE '%atmos%'";
      }
    }
    if (noJf) {
      sql += ' AND m.jellyfin_id IS NULL';
    }
    if (multiOnly) {
      sql += ' AND (SELECT COUNT(*) FROM files mf WHERE mf.movie_id = m.id) > 1';
    }
    if (releaseGroup) {
      sql += ' AND f.release_group LIKE ?';
      bindings.push(`%${releaseGroup}%`);
    }
    if (genres.length > 0) {
      const placeholders = genres.map(() => '?').join(',');
      sql += ` AND EXISTS (
        SELECT 1
        FROM json_each(COALESCE(m.genres, '[]')) g
        WHERE LOWER(CAST(g.value AS TEXT)) IN (${placeholders})
      )`;
      bindings.push(...genres.map((g) => g.toLowerCase()));
    }
    if (tags.length > 0) {
      const placeholders = tags.map(() => '?').join(',');
      sql += ` AND EXISTS (
        SELECT 1
        FROM json_each(COALESCE(m.tags, '[]')) t
        WHERE LOWER(CAST(t.value AS TEXT)) IN (${placeholders})
      )`;
      bindings.push(...tags);
    }
    if (search) {
      sql += ' AND (m.parsed_title LIKE ? OR m.jellyfin_title LIKE ? OR m.folder_name LIKE ?)';
      const pat = `%${search}%`;
      bindings.push(pat, pat, pat);
    }

    // Count total and compute filtered size aggregate before sort/pagination.
    const aggregateSql = `
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(COALESCE(file_size, 0)), 0) as total_size
      FROM (${sql})
    `;
    const aggregate = db
      .raw()
      .prepare(aggregateSql)
      .get(...bindings) as { total: number; total_size: number };
    const total = aggregate.total;
    const totalSize = aggregate.total_size;

    // Sort (search-aware relevance ranking first when query is present)
    const titleExpr = "LOWER(COALESCE(m.jellyfin_title, m.parsed_title, m.folder_name, ''))";
    const titleNormExpr = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(m.jellyfin_title, m.parsed_title, m.folder_name, ''), '(', ' '), ')', ' '), '.', ' '), '-', ' '), '_', ' '), ':', ' '), ',', ' '), '!', ' '), '?', ' '))`;
    const orderMap: Record<string, string> = {
      quality: 'f.resolution_cat ASC, f.mb_per_minute ASC',
      title: `LOWER(COALESCE(m.parsed_title, m.jellyfin_title, m.folder_name)) ${sortDir}`,
      year: `m.parsed_year ${sortDir}`,
      rating: `m.critic_rating ${sortDir}`,
      size: `f.file_size ${sortDir}`,
    };
    if (searchNorm) {
      sql += ` ORDER BY
        CASE
          WHEN ${titleExpr} = ? THEN 0
          WHEN (' ' || ${titleNormExpr} || ' ') LIKE ? THEN 1
          WHEN ${titleExpr} LIKE ? OR ${titleExpr} = ? THEN 2
          WHEN ${titleExpr} LIKE ? THEN 3
          WHEN ${titleExpr} LIKE ? THEN 4
          ELSE 5
        END ASC,
        LENGTH(${titleExpr}) ASC,
        ${orderMap[sortBy] ?? orderMap.quality}`;
      bindings.push(
        searchNorm,
        `% ${searchNorm} %`,
        `${searchNorm} %`,
        searchNorm,
        `${searchNorm}%`,
        `%${searchNorm}%`,
      );
    } else {
      sql += ` ORDER BY ${orderMap[sortBy] ?? orderMap.quality}`;
    }
    sql += ' LIMIT ? OFFSET ?';
    bindings.push(limit, offset);

    const rows = db
      .raw()
      .prepare(sql)
      .all(...bindings) as Array<Record<string, unknown>>;

    const movies = rows.map((row) => {
      const currentGroup = typeof row.release_group === 'string' ? row.release_group.trim() : '';
      const fileName = typeof row.file_name === 'string' ? row.file_name : '';
      if (!currentGroup && fileName) {
        row.release_group = extractReleaseGroup(fileName) ?? null;
      }
      delete row.file_name;
      return row;
    });

    return c.json({
      total,
      totalSize,
      page,
      limit,
      movies,
    });
  });

  // GET /api/movies/genres — distinct sorted genres from Jellyfin sync data
  app.get('/genres', (c) => {
    const rows = db
      .raw()
      .prepare("SELECT genres FROM movies WHERE genres IS NOT NULL AND genres != '[]'")
      .all() as Array<{ genres: string | null }>;

    const set = new Set<string>();
    for (const row of rows) {
      if (!row.genres) continue;
      try {
        const arr = JSON.parse(row.genres) as unknown;
        if (!Array.isArray(arr)) continue;
        for (const g of arr) {
          if (typeof g !== 'string') continue;
          const v = g.trim();
          if (v) set.add(v);
        }
      } catch {
        // Ignore malformed rows and continue.
      }
    }

    const genres = Array.from(set).sort((a, b) => a.localeCompare(b));
    return c.json({ genres });
  });

  // GET /api/movies/tags — distinct sorted tags from user metadata
  app.get('/tags', (c) => {
    const tags = db.getAllTags();
    return c.json({ tags });
  });

  // PATCH /api/movies/tags/batch  { ids:number[], addTags?:string[], removeTags?:string[] }
  app.patch('/tags/batch', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      ids?: unknown;
      addTags?: unknown;
      removeTags?: unknown;
    };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    if (ids.length === 0) return c.json({ error: 'ids_required' }, 400);

    const addTags = Array.isArray(body.addTags)
      ? body.addTags.map((t) => normalizeTag(t)).filter((t): t is string => !!t)
      : [];
    const removeTags = Array.isArray(body.removeTags)
      ? body.removeTags.map((t) => normalizeTag(t)).filter((t): t is string => !!t)
      : [];

    if (addTags.length === 0 && removeTags.length === 0) {
      return c.json({ error: 'no_tag_changes' }, 400);
    }

    let updated = 0;
    if (addTags.length > 0) updated += db.batchAddTags(ids, addTags);
    if (removeTags.length > 0) updated += db.batchRemoveTags(ids, removeTags);

    return c.json({ updated, requested: ids.length });
  });

  // GET /api/movies/:id
  app.get('/:id', (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    const files = db.getFilesForMovie(id);
    const pending = db
      .raw()
      .prepare(`
      SELECT id, reason, created_at
      FROM disambiguation_log
      WHERE matched_movie_id = ? AND reviewed = 0 AND ambiguous = 1
      ORDER BY id DESC
      LIMIT 1
    `)
      .get(id) as { id: number; reason: string | null; created_at: string } | undefined;

    const disambiguationRequired = !movie.jellyfin_id || Boolean(pending);
    const disambiguationReason = pending?.reason ?? (movie.jellyfin_id ? null : 'missing_jellyfin_match');

    return c.json({
      ...movie,
      files,
      disambiguation_required: disambiguationRequired,
      disambiguation_reason: disambiguationReason,
      disambiguation_pending_id: pending?.id ?? null,
      disambiguation_created_at: pending?.created_at ?? null,
    });
  });

  // PATCH /api/movies/:id  { tags?: string[]; notes?: string }
  app.patch('/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = (await c.req.json()) as { tags?: unknown; notes?: unknown };

    const tags = Array.isArray(body.tags) ? (body.tags as string[]).filter((t) => typeof t === 'string') : undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    const updated = db.updateMovieMeta(id, { tags, notes });
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json({ updated: true });
  });

  // POST /api/movies/remove-index  { ids: number[] }
  // Removes selected rows from Curatarr DB only. Files on disk stay untouched.
  app.post('/remove-index', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    if (ids.length === 0) return c.json({ error: 'ids_required' }, 400);

    const deleted = db.deleteMovies(ids);
    return c.json({ deleted, requested: ids.length });
  });

  // GET /api/movies/:id/folder-contents — list files on disk (for delete confirm)
  app.get('/:id/folder-contents', (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    const folderExists =
      fs.existsSync(movie.folder_path) &&
      (() => {
        try {
          return fs.statSync(movie.folder_path).isDirectory();
        } catch {
          return false;
        }
      })();
    const contents = folderExists ? listFolderContents(movie.folder_path) : [];
    const hasNonVideo = contents.some((f) => !f.isVideo);
    const videoCount = contents.filter((f) => f.isVideo).length;
    return c.json({ folderPath: movie.folder_path, contents, hasNonVideo, folderExists, videoCount });
  });

  // DELETE /api/movies/:id  { mode: 'files' | 'folder' }
  // Deletes video files (or entire folder) from disk, then removes the DB record.
  app.delete('/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);

    const body = (await c.req.json()) as { mode?: string };
    const mode = body.mode === 'folder' ? 'folder' : 'files';

    const deleted: string[] = [];
    const errors: string[] = [];

    const roots = parseLibraryRootsJson(db.getSetting('libraryRoots'));
    const allowlist = movieLibraryPaths(roots)
      .map((p) => {
        try {
          return fs.realpathSync(p);
        } catch {
          return path.resolve(p);
        }
      })
      .filter(Boolean);

    const folderStat = (() => {
      try {
        return fs.lstatSync(movie.folder_path);
      } catch {
        return null;
      }
    })();

    if (folderStat?.isSymbolicLink()) {
      return c.json({ error: 'forbidden_path', detail: 'Folder is a symlink; deletion aborted.' }, 400);
    }

    const folderReal = (() => {
      try {
        return fs.realpathSync(movie.folder_path);
      } catch {
        return path.resolve(movie.folder_path);
      }
    })();

    if (
      allowlist.length > 0 &&
      !allowlist.some((root) => folderReal === root || folderReal.startsWith(`${root}${path.sep}`))
    ) {
      return c.json({ error: 'forbidden_path', detail: 'Folder is outside configured library roots.' }, 400);
    }

    try {
      if (mode === 'folder') {
        await fs.promises.rm(folderReal, { recursive: true, force: true });
        deleted.push(folderReal);
      } else {
        // Delete only video files in the folder
        const contents = listFolderContents(movie.folder_path);
        for (const f of contents.filter((f) => f.isVideo)) {
          const full = path.join(movie.folder_path, f.name);
          try {
            const realFile = fs.realpathSync(full);
            if (
              allowlist.length > 0 &&
              !allowlist.some((root) => realFile === root || realFile.startsWith(`${root}${path.sep}`))
            ) {
              errors.push(`${f.name}: outside configured library roots`);
              continue;
            }
            const stat = fs.lstatSync(realFile);
            if (stat.isSymbolicLink()) {
              errors.push(`${f.name}: refusing to delete symlink`);
              continue;
            }
            await fs.promises.rm(realFile, { force: true });
            deleted.push(realFile);
          } catch (e) {
            errors.push(`${f.name}: ${(e as Error).message}`);
          }
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
    const id = Number.parseInt(c.req.param('id'), 10);
    const movie = db.getMovieById(id);
    if (!movie) return c.json({ error: 'not found' }, 404);
    const url = db.getSetting('jellyfinUrl') ?? '';
    const apiKey = db.getSetting('jellyfinApiKey') ?? '';
    if (!url || !apiKey) return c.json({ error: 'jellyfin_not_configured' }, 422);

    try {
      const client = new JellyfinClient(url, apiKey);
      let jf: JfMovie | undefined;
      const searchTitle = movie.jellyfin_title ?? movie.parsed_title ?? movie.folder_name;
      const searchYear = movie.jellyfin_year ?? movie.parsed_year ?? undefined;
      const unresolvedIdLookup = (err: Error): boolean => {
        if (err.name === 'JellyfinItemNotFoundError') return true;
        return /HTTP 400\b|HTTP 404\b/i.test(err.message);
      };

      if (movie.jellyfin_id) {
        try {
          jf = await client.getMovie(movie.jellyfin_id);
        } catch (err) {
          if (!unresolvedIdLookup(err as Error)) throw err;
        }
      }

      if (!jf) {
        const candidates = await client.searchMovies(searchTitle, searchYear ?? undefined);
        const expected = normTitle(searchTitle);
        const strictMatches = candidates.filter((candidate) => {
          const candidateTitle = normTitle(candidate.Name ?? '');
          return candidateTitle === expected && (searchYear == null || candidate.ProductionYear === searchYear);
        });
        const titleMatches = candidates.filter((candidate) => normTitle(candidate.Name ?? '') === expected);

        if (strictMatches.length === 1) {
          jf = strictMatches[0];
        } else if (strictMatches.length > 1 || titleMatches.length > 1) {
          flagDisambiguationNeeded(id, searchTitle, searchYear ?? null, 'multiple_jellyfin_candidates');
          return c.json(
            {
              error: 'disambiguation_required',
              detail: `Multiple Jellyfin candidates found for "${searchTitle}".`,
            },
            409,
          );
        } else if (titleMatches.length === 1) {
          jf = titleMatches[0];
        }
      }

      if (!jf) {
        flagDisambiguationNeeded(id, searchTitle, searchYear ?? null, 'no_jellyfin_match');
        return c.json(
          {
            error: 'disambiguation_required',
            detail: `No reliable Jellyfin match found for "${searchTitle}".`,
          },
          409,
        );
      }

      const validation = validateJellyfinCandidateAgainstFolder(movie, jf);
      if (!validation.ok) {
        const inputTitle = movie.parsed_title ?? movie.folder_name;
        flagDisambiguationNeeded(
          id,
          inputTitle,
          movie.parsed_year ?? null,
          validation.reason ?? 'filename_title_year_mismatch',
        );
        return c.json(
          {
            error: 'disambiguation_required',
            detail: validation.detail ?? 'Jellyfin match is inconsistent with folder title/year.',
          },
          409,
        );
      }

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
      const updated = db.getMovieById(id);
      if (!updated) return c.json({ error: 'not_found' }, 404);
      return c.json({ updated: true, movie: updated });
    } catch (err) {
      return c.json({ error: 'jellyfin_error', detail: (err as Error).message }, 502);
    }
  });

  return app;
}
