export interface TrashDeclarativeSettingMapping {
  key: string;
  trashLabel: string;
  value: string;
}

export const TRASH_DECLARATIVE_MODEL_VERSION = '2026-03-05-v1';

export const TRASH_DECLARATIVE_SETTING_MAPPINGS: TrashDeclarativeSettingMapping[] = [
  { key: 'scoutPipelineBasicResolutionScore', trashLabel: 'Resolution baseline', value: '6' },
  { key: 'scoutPipelineBasicVideoScore', trashLabel: 'Video baseline', value: '5' },
  { key: 'scoutPipelineBasicAudioScore', trashLabel: 'Audio baseline', value: '4' },
  { key: 'scoutPipelineBitrateTargetMbps', trashLabel: 'Bitrate target', value: '18' },
  { key: 'scoutPipelineBitrateTolerancePct', trashLabel: 'Bitrate tolerance', value: '40' },
  { key: 'scoutPipelineBitrateMaxScore', trashLabel: 'Bitrate alignment max', value: '12' },
  { key: 'scoutPipelineTrashRes2160', trashLabel: 'Resolution 2160p', value: '46' },
  { key: 'scoutPipelineTrashRes1080', trashLabel: 'Resolution 1080p', value: '24' },
  { key: 'scoutPipelineTrashRes720', trashLabel: 'Resolution 720p', value: '8' },
  { key: 'scoutPipelineTrashSourceRemux', trashLabel: 'Source Remux', value: '34' },
  { key: 'scoutPipelineTrashSourceBluray', trashLabel: 'Source Bluray', value: '22' },
  { key: 'scoutPipelineTrashSourceWebdl', trashLabel: 'Source WEB-DL', value: '14' },
  { key: 'scoutPipelineTrashCodecHevc', trashLabel: 'Codec HEVC', value: '22' },
  { key: 'scoutPipelineTrashCodecAv1', trashLabel: 'Codec AV1', value: '12' },
  { key: 'scoutPipelineTrashCodecH264', trashLabel: 'Codec H264', value: '6' },
  { key: 'scoutPipelineTrashAudioAtmos', trashLabel: 'Audio Atmos', value: '10' },
  { key: 'scoutPipelineTrashAudioTruehd', trashLabel: 'Audio TrueHD', value: '8' },
  { key: 'scoutPipelineTrashAudioDts', trashLabel: 'Audio DTS', value: '6' },
  { key: 'scoutPipelineTrashAudioDdp', trashLabel: 'Audio DDP/EAC3', value: '5' },
  { key: 'scoutPipelineTrashAudioAc3', trashLabel: 'Audio AC3', value: '2' },
  { key: 'scoutPipelineTrashAudioAac', trashLabel: 'Audio AAC', value: '1' },
  { key: 'scoutPipelineTrashLegacyPenalty', trashLabel: 'Legacy codec penalty', value: '40' },
  { key: 'scoutPipelineTrashSeedersDivisor', trashLabel: 'Seeders divisor', value: '25' },
  { key: 'scoutPipelineTrashSeedersBonusCap', trashLabel: 'Seeders bonus cap', value: '10' },
  { key: 'scoutPipelineTrashUsenetBonus', trashLabel: 'Usenet bonus', value: '10' },
  { key: 'scoutPipelineTrashTorrentBonus', trashLabel: 'Torrent bonus', value: '0' },
  { key: 'scoutPipelineLlmTieDelta', trashLabel: 'LLM tie delta', value: '10' },
  { key: 'scoutPipelineLlmWeakDropDelta', trashLabel: 'LLM weak drop delta', value: '40' },
];

export function buildTrashDeclarativeSettings(): Record<string, string> {
  return Object.fromEntries(TRASH_DECLARATIVE_SETTING_MAPPINGS.map((entry) => [entry.key, entry.value]));
}

export function buildTrashDeclarativeMappingSnapshot(): Array<{
  key: string;
  trashLabel: string;
  value: string;
}> {
  return TRASH_DECLARATIVE_SETTING_MAPPINGS.map((entry) => ({
    key: entry.key,
    trashLabel: entry.trashLabel,
    value: entry.value,
  }));
}
