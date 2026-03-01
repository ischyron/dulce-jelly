import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ExternalLink, RefreshCw, Film, Star, Tv2,
  Tag, FileText, AlertTriangle, Check, Loader2, Trash2,
} from 'lucide-react';
import { api, type FileRow } from '../api/client.js';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal.js';
import { ResolutionBadge, CodecBadge, HdrBadge } from '../components/QualityBadge.js';

// ── Helpers ────────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── File card ──────────────────────────────────────────────────────

function FileCard({ file }: { file: FileRow }) {
  const audioTracks: { codec: string; channels: number; language: string }[] =
    file.audio_tracks ? JSON.parse(file.audio_tracks) : [];
  const subtitles: string[] = file.subtitle_langs ? JSON.parse(file.subtitle_langs) : [];

  return (
    <div className="border rounded-xl p-4 space-y-3 text-sm"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <div className="font-mono text-xs truncate" style={{ color: 'var(--c-muted)' }} title={file.file_path}>
        {file.filename}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <ResolutionBadge resolution={file.resolution_cat} />
        <CodecBadge codec={file.video_codec} showCompatWarning />
        <HdrBadge hdrFormats={file.hdr_formats} dvProfile={file.dv_profile} />
        {file.bit_depth && file.bit_depth > 8 && (
          <span className="px-1.5 py-0.5 text-xs font-mono rounded border"
            style={{ background: 'rgba(38,38,58,0.5)', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
            {file.bit_depth}-bit
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--c-muted)' }}>
        <span>Size: <span style={{ color: '#d4cfff' }}>{fmtSize(file.file_size)}</span></span>
        <span>Duration: <span style={{ color: '#d4cfff' }}>{fmtDuration(file.duration)}</span></span>
        <span>MB/min: <span style={{ color: '#d4cfff' }}>{file.mb_per_minute?.toFixed(1) ?? '—'}</span></span>
        <span>Container: <span style={{ color: '#d4cfff' }}>{(file.container ?? '—').toUpperCase()}</span></span>
        {file.release_group && (
          <span>Group: <span style={{ color: '#d4cfff' }}>{file.release_group}</span></span>
        )}
        {file.audio_profile && (
          <span>Audio: <span style={{ color: '#d4cfff' }}>{file.audio_profile}</span></span>
        )}
        {file.frame_rate != null && (
          <span>FPS: <span style={{ color: '#d4cfff' }}>{file.frame_rate.toFixed(3)}</span></span>
        )}
      </div>
      {audioTracks.length > 1 && (
        <div className="text-xs" style={{ color: '#6b6888' }}>
          Tracks: {audioTracks.map(t => `${t.codec} ${t.channels}ch${t.language ? ` [${t.language}]` : ''}`).join(', ')}
        </div>
      )}
      {subtitles.length > 0 && (
        <div className="text-xs" style={{ color: '#6b6888' }}>
          Subtitles: {subtitles.join(', ')}
        </div>
      )}
      {file.verify_status === 'fail' && (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <AlertTriangle size={11} /> Integrity check failed
        </div>
      )}
      {file.scan_error && (
        <div className="text-xs text-red-400">Scan error: {file.scan_error}</div>
      )}
      <div className="text-xs font-mono break-all" style={{ color: '#3f3f5a' }}>
        {file.file_path}
      </div>
    </div>
  );
}

// ── Tag editor ─────────────────────────────────────────────────────

function TagEditor({
  tags, onSave,
}: { tags: string[]; onSave: (t: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [local, setLocal] = useState(tags);

  useEffect(() => { setLocal(tags); }, [tags]);

  function addTag() {
    const t = input.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || local.includes(t)) { setInput(''); return; }
    const next = [...local, t];
    setLocal(next);
    setInput('');
    onSave(next);
  }

  function removeTag(t: string) {
    const next = local.filter(x => x !== t);
    setLocal(next);
    onSave(next);
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {local.map(t => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#c4b5fd' }}>
          {t}
          <button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100 leading-none">×</button>
        </span>
      ))}
      {editing ? (
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { addTag(); } if (e.key === 'Escape') { setEditing(false); setInput(''); } }}
          onBlur={() => { addTag(); setEditing(false); }}
          placeholder="tag name…"
          className="px-2 py-0.5 rounded text-xs focus:outline-none w-24"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-accent)', color: 'var(--c-text)' }}
        />
      ) : (
        <button onClick={() => setEditing(true)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border opacity-50 hover:opacity-100"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
          + add
        </button>
      )}
    </div>
  );
}

// ── ID link ────────────────────────────────────────────────────────

function IdLink({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span style={{ color: 'var(--c-muted)' }}>{label}:</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-mono hover:underline"
          style={{ color: '#a78bfa' }}>
          {value} <ExternalLink size={10} />
        </a>
      ) : (
        <span className="font-mono" style={{ color: '#a78bfa' }}>{value}</span>
      )}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const movieId = parseInt(id ?? '0', 10);

  const { data, isLoading, error } = useQuery({
    queryKey: ['movie', movieId],
    queryFn: () => api.movie(movieId),
    enabled: !!movieId,
  });

  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) setNotes(data.notes ?? '');
  }, [data]);

  const patchMutation = useMutation({
    mutationFn: (meta: { tags?: string[]; notes?: string }) => api.patchMovie(movieId, meta),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movie', movieId] }),
  });

  const jfRefreshMutation = useMutation({
    mutationFn: () => api.jfRefreshMovie(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movie', movieId] }),
  });

  function saveNotes() {
    patchMutation.mutate({ notes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: 'var(--c-muted)' }}>
        <Loader2 size={20} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="text-red-400 mb-4">Movie not found.</div>
        <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--c-muted)' }}>
          ← Back
        </button>
      </div>
    );
  }

  const genres: string[] = data.genres ? JSON.parse(data.genres) : [];
  const tags: string[] = data.tags ? JSON.parse(data.tags) : [];
  const displayTitle = data.jellyfin_title ?? data.parsed_title ?? data.folder_name;

  // Build Jellyfin web deep-link (settings/env provides the base URL)
  const jellyfinBase = (window as typeof window & { __JELLYFIN_URL__?: string }).__JELLYFIN_URL__ ?? '';
  const jellyfinDeepLink = data.jellyfin_id && jellyfinBase
    ? `${jellyfinBase}/web/#/details?id=${data.jellyfin_id}`
    : undefined;

  return (
    <>
    <div className="p-6 max-w-4xl space-y-6">

      {/* Breadcrumb / back */}
      <div className="flex items-center justify-between">
        <Link to="/library" className="inline-flex items-center gap-1 text-sm hover:underline"
          style={{ color: 'var(--c-muted)' }}>
          <ArrowLeft size={14} /> Library
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => jfRefreshMutation.mutate()}
            disabled={!data.jellyfin_id || jfRefreshMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
            title={data.jellyfin_id ? 'Refresh metadata from Jellyfin' : 'No Jellyfin ID — run jf-sync first'}>
            {jfRefreshMutation.isPending
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
            Refresh from Jellyfin
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="rounded-xl border p-6" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Poster placeholder */}
          <div className="shrink-0 w-32 h-48 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
            <Film size={32} style={{ color: 'var(--c-border)' }} />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>
                {displayTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
                <span>{data.jellyfin_year ?? data.parsed_year ?? '—'}</span>
                {data.critic_rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Tv2 size={12} /> MC {data.critic_rating}
                  </span>
                )}
                {data.community_rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star size={12} /> {data.community_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genres.map(g => (
                  <span key={g} className="px-2 py-0.5 text-xs rounded"
                    style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {data.overview && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                {data.overview}
              </p>
            )}

            {/* ID links — canonical linking mechanism */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <IdLink
                label="IMDb"
                value={data.imdb_id}
                href={data.imdb_id ? `https://www.imdb.com/title/${data.imdb_id}/` : undefined}
              />
              <IdLink
                label="TMDb"
                value={data.tmdb_id}
                href={data.tmdb_id ? `https://www.themoviedb.org/movie/${data.tmdb_id}` : undefined}
              />
              <IdLink
                label="Jellyfin ID"
                value={data.jellyfin_id}
                href={jellyfinDeepLink}
              />
            </div>

            {data.jf_synced_at && (
              <div className="text-xs" style={{ color: '#3f3f5a' }}>
                JF synced: {new Date(data.jf_synced_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Curatarr augmentation */}
      <div className="rounded-xl border p-5 space-y-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          <Tag size={14} style={{ color: 'var(--c-accent)' }} />
          Tags
        </h2>
        <TagEditor
          tags={tags}
          onSave={t => patchMutation.mutate({ tags: t })}
        />

        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          <FileText size={14} style={{ color: 'var(--c-accent)' }} />
          Notes
        </h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Add notes about this movie…"
          className="w-full px-3 py-2 rounded-lg text-sm resize-y focus:outline-none"
          style={{
            background: 'var(--c-bg)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text)',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={saveNotes}
            disabled={patchMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--c-accent)' }}>
            Save Notes
          </button>
          {notesSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Files */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: '#d4cfff' }}>
          Files ({data.files.length})
        </h2>
        {data.files.map(f => <FileCard key={f.id} file={f} />)}
      </div>

      {/* Folder path */}
      <div className="text-xs font-mono break-all pb-4" style={{ color: '#3f3f5a' }}>
        {data.folder_path}
      </div>
    </div>

    {showDelete && (
      <DeleteConfirmModal
        movieId={movieId}
        movieTitle={displayTitle}
        onClose={() => setShowDelete(false)}
        onDeleted={() => navigate('/library')}
      />
    )}
    </>
  );
}
