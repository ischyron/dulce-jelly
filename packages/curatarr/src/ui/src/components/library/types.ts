export const RESOLUTION_OPTIONS = ['2160p', '1080p', '720p', '480p', 'other'];
export const CODEC_OPTIONS = ['hevc', 'h264', 'av1', 'mpeg4'];
export const AUDIO_FORMAT_OPTIONS = ['ddp', 'truehd', 'dts', 'aac', 'ac3', 'atmos'];
export const AUDIO_LAYOUT_OPTIONS = ['stereo', '5.1', '7.1'];
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 'all'] as const;
export const AV1_WARN_PROFILES = new Set(['android_tv', 'fire_tv']);

export const PERSIST_FILTER_KEYS = [
  'q',
  'resolution',
  'codec',
  'audioFormat',
  'audioLayout',
  'genre',
  'tags',
  'hdr',
  'dv',
  'av1Compat',
  'legacy',
  'noJf',
  'multi',
] as const;

export type SortField = 'quality' | 'title' | 'year' | 'rating' | 'size';

export const SORT_FIELDS: ReadonlySet<SortField> = new Set(['quality', 'title', 'year', 'rating', 'size']);
