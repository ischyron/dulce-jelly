import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader2, Square } from 'lucide-react';

interface FolderStatus {
  name: string;
  fileCount: number;
  done: boolean;
}

interface ScanProgress {
  filesProcessed?: number;
  filesOk?: number;
  filesErrored?: number;
  foldersTotal?: number;
  foldersDone?: number;
  currentRate?: number;
  file?: string;
  folder?: string;
  cancelled?: boolean;
}

interface Props {
  mode: 'scan' | 'sync';
  onClose: () => void;
}

export function ScanProgressModal({ mode, onClose }: Props) {
  const [done, setDone] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress>({});
  const [completedFolders, setCompletedFolders] = useState<FolderStatus[]>([]);
  const [ambiguous, setAmbiguous] = useState<unknown[]>([]);
  const folderListRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const endpoint = mode === 'scan' ? '/api/scan/events' : '/api/jf-sync/events';
  const cancelEndpoint = mode === 'scan' ? '/api/scan/cancel' : null;

  useEffect(() => {
    const es = new EventSource(endpoint);
    esRef.current = es;

    es.addEventListener('progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data || '{}') as ScanProgress;
      setProgress(data);
    });

    es.addEventListener('folder_complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data || '{}') as { folderName: string; fileCount: number };
      setCompletedFolders(prev => {
        // Avoid duplicates
        if (prev.some(f => f.name === data.folderName)) return prev;
        const next = [...prev, { name: data.folderName, fileCount: data.fileCount, done: true }];
        return next.slice(-200); // keep last 200
      });
      // Auto-scroll folder list
      setTimeout(() => {
        folderListRef.current?.scrollTo({ top: folderListRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data || '{}') as { cancelled?: boolean };
      if (data.cancelled) setCancelled(true);
      setDone(true);
      es.close();
    });

    es.addEventListener('cancelled', () => {
      setCancelled(true);
      setDone(true);
      es.close();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      const data = JSON.parse(e.data || '{}') as { message?: string };
      setError(String(data.message ?? 'Unknown error'));
      setDone(true);
      es.close();
    });

    es.addEventListener('ambiguous', (e: MessageEvent) => {
      const data = JSON.parse(e.data || '{}');
      setAmbiguous(prev => [...prev.slice(-50), data]);
    });

    return () => es.close();
  }, [endpoint]);

  async function stopScan() {
    if (!cancelEndpoint) return;
    await fetch(cancelEndpoint, { method: 'POST' });
  }

  const filesProcessed = Number(progress.filesProcessed ?? 0);
  const filesOk = Number(progress.filesOk ?? 0);
  const filesErrored = Number(progress.filesErrored ?? 0);
  const foldersTotal = Number(progress.foldersTotal ?? 0);
  const foldersDone = Number(progress.foldersDone ?? 0);
  const rate = Number(progress.currentRate ?? 0);
  const pct = foldersTotal > 0 ? Math.round((foldersDone / foldersTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#16161f] border border-[#26263a] rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#26263a] shrink-0">
          <h2 className="font-semibold text-[#f0eeff] flex items-center gap-2">
            {!done && <Loader2 size={15} className="animate-spin text-[#a78bfa]" />}
            {mode === 'scan' ? 'Library Scan' : 'Jellyfin Sync'}
            {cancelled && <span className="text-amber-400 text-sm font-normal ml-2">— cancelled</span>}
          </h2>
          <button onClick={onClose} className="text-[#8b87aa] hover:text-[#f0eeff]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Progress bar */}
          {!done && (
            <div>
              <div className="flex justify-between text-xs text-[#8b87aa] mb-1">
                <span>{mode === 'scan' ? 'Scanning…' : 'Syncing…'}</span>
                <span>{foldersTotal > 0 ? `${foldersDone} / ${foldersTotal} folders` : ''} {pct > 0 ? `(${pct}%)` : ''}</span>
              </div>
              <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7c3aed] transition-all duration-300 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {done && !error && (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle size={18} />
              <span className="font-medium">{cancelled ? 'Cancelled' : 'Complete'}</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Stats grid */}
          {mode === 'scan' && filesProcessed > 0 && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Processed" value={filesProcessed} />
              <Stat label="OK" value={filesOk} color="text-green-400" />
              <Stat label="Errors" value={filesErrored} color={filesErrored > 0 ? 'text-red-400' : 'text-[#6b6888]'} />
            </div>
          )}

          {rate > 0 && (
            <p className="text-xs text-[#6b6888] text-center">{rate.toFixed(1)} files/sec</p>
          )}

          {progress.file && (
            <p className="text-xs text-[#6b6888] truncate font-mono">
              {String(progress.file)}
            </p>
          )}

          {/* Completed folders list */}
          {completedFolders.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#6b6888] uppercase tracking-wider mb-2">
                Completed Folders ({completedFolders.length})
              </h3>
              <div
                ref={folderListRef}
                className="h-40 overflow-y-auto bg-[#1e1e2e]/50 rounded-lg p-2 space-y-1"
              >
                {completedFolders.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckCircle size={11} className="text-green-500 shrink-0" />
                    <span className="text-[#c4b5fd] truncate">{f.name}</span>
                    <span className="text-[#6b6888] ml-auto shrink-0">{f.fileCount}f</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending folders count */}
          {foldersTotal > 0 && foldersDone < foldersTotal && !done && (
            <p className="text-xs text-[#6b6888]">
              {foldersTotal - foldersDone} folders pending…
            </p>
          )}

          {/* Ambiguous matches (sync) */}
          {ambiguous.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
                Ambiguous Matches ({ambiguous.length})
              </h3>
              <div className="h-32 overflow-y-auto bg-[#1e1e2e]/50 rounded-lg p-2 space-y-1">
                {(ambiguous as Record<string, unknown>[]).map((a, i) => (
                  <div key={i} className="text-xs text-amber-300/80">
                    <span className="font-medium">{String(a.jfTitle)}</span>
                    {a.jfYear ? ` (${a.jfYear})` : ''} →{' '}
                    <span className="text-[#8b87aa]">{String(a.dbFolderName)}</span>
                    {a.dbParsedYear ? ` (${a.dbParsedYear})` : ''}
                    <span className="text-amber-600 ml-1">[{String(a.reason)}]</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#26263a] flex items-center justify-between shrink-0">
          {!done && cancelEndpoint && (
            <button
              onClick={stopScan}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/50 hover:bg-red-800/60 border border-red-800 text-red-300 rounded-lg text-sm font-medium"
            >
              <Square size={13} />
              Stop Scan
            </button>
          )}
          {done && (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-sm font-medium"
            >
              Close
            </button>
          )}
          {!done && <div />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-[#f0eeff]' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#1e1e2e] rounded-lg p-2">
      <div className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-[#6b6888]">{label}</div>
    </div>
  );
}
