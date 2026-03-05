import type { ComponentType, DragEvent } from 'react';
import type {
  ScoutAutoStatusResponse,
  ScoutCustomCfPreviewResponse,
  ScoutRulesRefineDraftResponse,
  ScoutTrashParityResponse,
  ScoutTrashSyncDetailsResponse,
} from '../../../../shared/types/api';
import type { BitrateProfileId, BitrateProfileSpec, OrderedScoreField } from './content';

export type SettingsForm = Record<string, string>;
export type SetField = (name: string, value: string) => void;

export type FieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  tooltip?: string;
};

export type MaskedKeyFieldProps = {
  label: string;
  name: string;
  maskedValue: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
};

export type JellyfinHealth = { ok: boolean; libraries?: number; error?: string } | null;
export type ProwlarrHealth = { ok: boolean; indexers?: number; error?: string } | null;

export interface ScoutRuleDraft {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  configText: string;
}

export interface ScoutCustomCfDraft {
  id?: number;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: 'regex' | 'string';
  pattern: string;
  score: string;
  flags: string;
  appliesTo: 'title' | 'full';
}

export interface ScoutLlmRuleDraft {
  id?: number;
  name: string;
  enabled: boolean;
  priority: number;
  sentence: string;
}

export interface LibraryRootEntry {
  type: 'movies' | 'series';
  path: string;
}

export interface GeneralPanelProps {
  form: SettingsForm;
  set: SetField;
  checkJellyfinHealth: () => Promise<void>;
  checkingJellyfinHealth: boolean;
  jellyfinHealth: JellyfinHealth;
  movieRoots: string[];
  updateMovieRoot: (index: number, value: string) => void;
  openBrowse: (index: number) => Promise<void>;
  removeMovieRoot: (index: number) => void;
  addMovieRoot: () => void;
  clientProfile: string;
  setClientProfile: (id: string) => void;
}

export interface ProwlarrSectionProps {
  form: SettingsForm;
  set: SetField;
  checkProwlarrHealth: () => Promise<void>;
  checkingProwlarrHealth: boolean;
  prowlarrHealth: ProwlarrHealth;
}

export interface LlmProviderSectionProps {
  form: SettingsForm;
  set: SetField;
}

export interface MinimumQualifiersSectionProps {
  form: SettingsForm;
  set: SetField;
}

export interface CfScoringSectionProps {
  form: SettingsForm;
  set: SetField;
  activeProfileLabel: string;
  activeProfileAv1: string;
  bitrateProfileId: BitrateProfileId;
  setBitrateProfileId: (id: BitrateProfileId) => void;
  applyBitrateProfile: (id: BitrateProfileId) => void;
  selectedBitrateProfile: BitrateProfileSpec;
  detectedBitrateProfile: BitrateProfileId | null;
}

export interface TrashSyncDetailsSectionProps {
  onSyncTrash: () => void;
  syncingTrash: boolean;
  syncTrashError?: string;
  hasTrashSyncDetails: boolean;
  syncedTrashSource: string;
  syncedTrashRevision: string;
  syncedTrashAt: string;
  syncedTrashRules: string;
  syncedTrashWarning: string;
  appliedSettingsEntries: Array<[string, string]>;
  appliedRules: ScoutTrashSyncDetailsResponse['applied']['rules'];
  upstreamSnapshot: ScoutTrashSyncDetailsResponse['upstream'] | null;
}

export interface TrashBaselineSectionProps {
  trashParityData?: ScoutTrashParityResponse;
  onRefreshBaseline: () => void;
}

export interface CustomOverridesSectionProps {
  customCfDraft: ScoutCustomCfDraft[];
  updateCustomCfRule: (index: number, patch: Partial<ScoutCustomCfDraft>) => void;
  removeCustomCfRule: (index: number) => void;
  addCustomCfRule: () => void;
  saveCustomCf: () => void;
  savePending: boolean;
  customCfSaved: boolean;
  customCfError: string;
  customCfPreviewTitle: string;
  setCustomCfPreviewTitle: (value: string) => void;
  runCustomCfPreview: () => void;
  customCfPreviewPending: boolean;
  customCfPreviewData?: ScoutCustomCfPreviewResponse;
}

export interface RulesSectionProps {
  scoutRulesDraft: ScoutRuleDraft[];
  updateScoutRule: (id: number, patch: Partial<ScoutRuleDraft>) => void;
  saveScoutRules: () => void;
  savePending: boolean;
  scoutRulesSaved: boolean;
  scoutRulesError: string;
}

export interface ExtendedLlmRulesetSectionProps {
  llmRulesDraft: ScoutLlmRuleDraft[];
  llmDragIndex: number | null;
  onLlmDragStart: (index: number) => void;
  onLlmDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onLlmDrop: (targetIndex: number) => void;
  onLlmDragEnd: () => void;
  updateLlmRule: (index: number, patch: Partial<ScoutLlmRuleDraft>) => void;
  removeLlmRule: (index: number) => void;
  addLlmRule: () => void;
  addLlmSampleRules: () => void;
  saveLlmRules: () => void;
  savePending: boolean;
  llmRulesSaved: boolean;
  llmRulesError: string;
  refineObjective: string;
  setRefineObjective: (value: string) => void;
  generateDraft: () => void;
  draftPending: boolean;
  draftData?: ScoutRulesRefineDraftResponse;
}

export interface AutomationSectionProps {
  form: SettingsForm;
  set: SetField;
  autoStatusData?: ScoutAutoStatusResponse;
  runAutoScout: () => void;
  runPending: boolean;
}

export interface ScoutPanelProps {
  prowlarr: ProwlarrSectionProps;
  llmProvider: LlmProviderSectionProps;
  minimumQualifiers: MinimumQualifiersSectionProps;
  cfScoring: CfScoringSectionProps;
  trashSyncDetails: TrashSyncDetailsSectionProps;
  trashBaseline: TrashBaselineSectionProps;
  customOverrides: CustomOverridesSectionProps;
  rules: RulesSectionProps;
  extendedLlmRuleset: ExtendedLlmRulesetSectionProps;
  automation: AutomationSectionProps;
}

export interface OrderedScoreRowProps {
  fields: OrderedScoreField[];
  form: SettingsForm;
  onChange: SetField;
}

export type FieldComponent = ComponentType<FieldProps>;
export type MaskedKeyFieldComponent = ComponentType<MaskedKeyFieldProps>;
