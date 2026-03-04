import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Trash2, AlertTriangle, FolderOpen, File, Loader2, X } from 'lucide-react';
import { api } from '../api/client.js';

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / 1e6;
  return mb >= 1000 ? `${(bytes / 1e9).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

interface Props {
  movieId: number;
  movieTitle: string;
  onDeleted: () => void;
  onClose: () => void;
}

export function DeleteConfirmModal({ movieId, movieTitle, onDeleted, onClose }: Props) {
  const [mode, setMode] = useState<'files' | 'folder'>('files');

  const { data: contents, isLoading } = useQuery({
    queryKey: ['movie-folder-contents', movieId],
    queryFn: () => api.movieFolderContents(movieId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteMovie(movieId, mode),
    onSuccess: (result) => {
      if (result.errors.length === 0) {
        onDeleted();
      }
    },
  });

  const videoFiles = contents?.contents.filter(f => f.isVideo) ?? [];
  const otherFiles = contents?.contents.filter(f => !f.isVideo) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl border shadow-2xl"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--c-border)' }}>
          <div className="flex items-center gap-2 text-red-400 font-medium">
            <Trash2 size={16} />
            Delete Movie
          </div>
          <button onClick={onClose} style={{ color: 'var(--c-muted)' }}><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm" style={{ color: 'var(--c-text)' }}>
            You are about to delete <strong>{movieTitle}</strong>.
            This is permanent and cannot be undone.
          </p>

          {/* Folder contents */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Scanning folder…
            </div>
          ) : contents && (
            <div className="rounded-lg border overflow-hidden text-xs font-mono"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
              <div className="px-3 py-2 text-xs font-sans font-medium border-b"
                style={{ color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>
                <FolderOpen size={11} className="inline mr-1" />
                {contents.folderPath}
              </div>
              {contents.contents.map(f => (
                <div key={f.name}
                  className="flex items-center justify-between px-3 py-1.5 border-b last:border-0"
                  style={{ borderColor: 'var(--c-border)', color: f.isVideo ? '#c4b5fd' : 'var(--c-muted)' }}>
                  <span className="flex items-center gap-1.5 truncate">
                    <File size={10} />
                    {f.name}
                  </span>
                  <span className="ml-3 shrink-0 opacity-60">{fmtSize(f.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Non-video warning */}
          {contents?.hasNonVideo && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                This folder contains {otherFiles.length} non-video file{otherFiles.length !== 1 ? 's' : ''} (
                {otherFiles.map(f => f.name).join(', ')}).
                {' '}Choosing <strong>"Video files only"</strong> will leave these behind.
              </span>
            </div>
          )}

          {/* Mode choice */}
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border"
              style={{
                borderColor: mode === 'files' ? '#7c3aed' : 'var(--c-border)',
                background: mode === 'files' ? 'rgba(124,58,237,0.1)' : 'var(--c-bg)',
              }}>
              <input type="radio" name="deleteMode" value="files"
                checked={mode === 'files'} onChange={() => setMode('files')}
                className="mt-0.5 accent-violet-600" />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  Video files only
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
                  Delete {videoFiles.length} video file{videoFiles.length !== 1 ? 's' : ''}, keep the folder and any other files.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border"
              style={{
                borderColor: mode === 'folder' ? '#ef4444' : 'var(--c-border)',
                background: mode === 'folder' ? 'rgba(239,68,68,0.08)' : 'var(--c-bg)',
              }}>
              <input type="radio" name="deleteMode" value="folder"
                checked={mode === 'folder'} onChange={() => setMode('folder')}
                className="mt-0.5 accent-red-500" />
              <div>
                <div className="text-sm font-medium text-red-400">
                  Entire folder
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
                  Delete all {contents?.contents.length ?? 0} files and the folder itself.
                  {contents?.hasNonVideo && ' This includes non-video files.'}
                </div>
              </div>
            </label>
          </div>

          {/* Result errors */}
          {deleteMutation.data?.errors && deleteMutation.data.errors.length > 0 && (
            <div className="p-3 rounded-lg text-xs text-red-400"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {deleteMutation.data.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t"
          style={{ borderColor: 'var(--c-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending || isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: mode === 'folder' ? '#dc2626' : '#7c3aed' }}>
            {deleteMutation.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Deleting…</>
              : <><Trash2 size={14} /> Delete {mode === 'folder' ? 'Folder' : 'Video Files'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
