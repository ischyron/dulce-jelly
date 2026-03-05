export function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx++;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function bitrateToSizeGb(mbps: number, minutes: number): number {
  if (!Number.isFinite(mbps) || mbps <= 0 || !Number.isFinite(minutes) || minutes <= 0) return 0;
  return (((mbps * 1_000_000) / 8) * (minutes * 60)) / 1_000_000_000;
}

export function formatGigabytes(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return '0.0 GB';
  return `${gb.toFixed(1)} GB`;
}
