import type { ComponentType, DragEvent } from 'react';
import type {
  ScoutAutoStatusResponse,
  ScoutCustomCfPreviewResponse,
  ScoutRulesRefineDraftResponse,
  ScoutTrashSyncDetailsResponse,
} from '../../../../shared/types/api';
import type { OrderedScoreField } from './content';

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

export interface ScoutBlockerDraft {
  id?: number;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: 'regex' | 'string';
  pattern: string;
  flags: string;
  appliesTo: 'title' | 'full';
  reason: string;
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
}

export interface TrashSyncDetailsSectionProps {
  onSyncTrash: () => void;
  syncingTrash: boolean;
  syncTrashError?: string;
  hasTrashSyncDetails: boolean;
  syncedTrashSource: string;
  syncedTrashRevision: string;
  syncedTrashModelVersion: string;
  syncedTrashMappingRevision: string;
  syncedTrashAt: string;
  syncedTrashRules: string;
  syncedTrashWarning: string;
  upstreamSnapshot: ScoutTrashSyncDetailsResponse['upstream'] | null;
}

export interface CustomOverridesSectionProps {
  form: SettingsForm;
  set: SetField;
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
  blockerDraft: ScoutBlockerDraft[];
  updateBlockerRule: (index: number, patch: Partial<ScoutBlockerDraft>) => void;
  removeBlockerRule: (index: number) => void;
  addBlockerRule: () => void;
  saveBlockers: () => void;
  blockersSavePending: boolean;
  blockersSaved: boolean;
  blockersError: string;
}

export interface ExtendedLlmRulesetSectionProps {
  form: SettingsForm;
  set: SetField;
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
  customOverrides: CustomOverridesSectionProps;
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
