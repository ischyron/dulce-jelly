import type { Movie } from '../../api/client';

interface Props {
  movie: Movie;
}

export function StatusDots({ movie }: Props) {
  let scanColor = '#3f3f5a';
  let scanTitle = 'Not scanned yet';
  if (movie.scan_error) {
    scanColor = '#f87171';
    scanTitle = `Scan error: ${movie.scan_error}`;
  } else if (movie.scanned_at) {
    if (movie.verify_status === 'fail') {
      scanColor = '#fb923c';
      scanTitle = 'Verify failed — file may be corrupt';
    } else {
      scanColor = '#4ade80';
      scanTitle = 'Scanned successfully';
    }
  } else if (movie.file_id) {
    scanColor = '#fbbf24';
    scanTitle = 'File found but not scanned yet';
  }

  const jfColor = movie.jellyfin_id ? '#7c3aed' : '#3f3f5a';
  const jfTitle = movie.jellyfin_id
    ? `Jellyfin matched${movie.jf_synced_at ? ` · synced ${movie.jf_synced_at.slice(0, 10)}` : ''}`
    : 'Not matched in Jellyfin';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: scanColor }} title={scanTitle} />
      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: jfColor }} title={jfTitle} />
    </span>
  );
}
