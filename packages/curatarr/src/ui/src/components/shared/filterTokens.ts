export const FILTER_TOKENS = {
  genre: {
    label: 'Genre',
    select: 'Select genres',
    noOptions: 'No genres available.',
  },
  tags: {
    label: 'Tags',
    select: 'Select tags',
    noOptions: 'No tags available.',
  },
  video: {
    label: 'Video',
    hdr: 'HDR',
    dv: 'DV',
    av1Compat: 'AV1 compat',
    legacy: 'Legacy',
  },
  audio: {
    label: 'Audio',
    formatPlaceholder: 'Format',
    channelsPlaceholder: 'Channels',
  },
} as const;
