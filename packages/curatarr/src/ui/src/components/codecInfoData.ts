export interface CodecInfoItem {
  key: string;
  label: string;
  filterHint?: string;
  description: string;
}

export const VIDEO_CODEC_INFO: CodecInfoItem[] = [
  {
    key: 'hevc',
    label: 'HEVC (H.265 / x265)',
    filterHint: 'codec=hevc',
    description: 'Efficient codec for 4K/HDR. Usually best quality-per-size in most current libraries.',
  },
  {
    key: 'h264',
    label: 'H264 (AVC / x264)',
    filterHint: 'codec=h264',
    description: 'Most compatible codec across clients and devices, but larger files than HEVC for same quality.',
  },
  {
    key: 'av1',
    label: 'AV1',
    filterHint: 'codec=av1 / av1Compat=1',
    description: 'High compression efficiency. Some TV clients lack hardware decode and may transcode.',
  },
  {
    key: 'mpeg4',
    label: 'MPEG-4 / Legacy',
    filterHint: 'codec=mpeg4 / legacy=1',
    description: 'Older codec family with lower efficiency and compatibility risks. Replacement is often recommended.',
  },
];

export const VIDEO_FORMAT_INFO: CodecInfoItem[] = [
  {
    key: 'hdr',
    label: 'HDR',
    filterHint: 'hdr=1',
    description: 'High Dynamic Range signal present in file metadata.',
  },
  {
    key: 'dv',
    label: 'Dolby Vision (DV)',
    filterHint: 'dv=1',
    description: 'Dolby Vision metadata present. Playback support depends on client device/profile support.',
  },
  {
    key: 'legacy',
    label: 'Legacy Filter',
    filterHint: 'legacy=1',
    description: 'Shows legacy video codecs (MPEG-4 / MPEG-2 / MSMPEG variants).',
  },
];

export const AUDIO_FORMAT_INFO: CodecInfoItem[] = [
  {
    key: 'ddp',
    label: 'DD+ / EAC3',
    filterHint: 'audioFormat=ddp',
    description: 'Dolby Digital Plus. Common streaming surround format with good playback compatibility.',
  },
  {
    key: 'truehd',
    label: 'TrueHD',
    filterHint: 'audioFormat=truehd',
    description: 'High-bitrate lossless Dolby format. Best quality, but may require passthrough-capable setups.',
  },
  {
    key: 'dts',
    label: 'DTS Family',
    filterHint: 'audioFormat=dts',
    description: 'Includes DTS variants (DTS, DTS-HD). Some clients may transcode depending on support.',
  },
  {
    key: 'aac',
    label: 'AAC',
    filterHint: 'audioFormat=aac',
    description: 'Efficient, widely-supported codec. Common in smaller encodes and web-focused releases.',
  },
  {
    key: 'ac3',
    label: 'AC3',
    filterHint: 'audioFormat=ac3',
    description: 'Dolby Digital (legacy lossy surround). Broad compatibility across media players and TVs.',
  },
  {
    key: 'atmos',
    label: 'Atmos',
    filterHint: 'audioFormat=atmos',
    description: 'Dolby Atmos object-based audio marker, usually paired with DD+ or TrueHD tracks.',
  },
];

export const AUDIO_LAYOUT_INFO: CodecInfoItem[] = [
  {
    key: 'stereo',
    label: 'Stereo (2.0)',
    filterHint: 'audioLayout=stereo',
    description: 'Two-channel audio mix, most universally compatible.',
  },
  {
    key: '5.1',
    label: '5.1 Surround',
    filterHint: 'audioLayout=5.1',
    description: 'Six-channel surround layout used in most home-theater releases.',
  },
  {
    key: '7.1',
    label: '7.1 Surround',
    filterHint: 'audioLayout=7.1',
    description: 'Eight-channel surround layout. Higher channel count, but support depends on playback chain.',
  },
];
