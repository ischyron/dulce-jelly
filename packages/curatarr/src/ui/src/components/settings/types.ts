import type { ComponentType } from 'react';

type SettingsForm = Record<string, string>;

type FieldProps = {
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

type MaskedKeyFieldProps = {
  label: string;
  name: string;
  maskedValue: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
};

type JellyfinHealth = { ok: boolean; libraries?: number; error?: string } | null;
type ProwlarrHealth = { ok: boolean; indexers?: number; error?: string } | null;

export interface GeneralSettingsContext {
  form: SettingsForm;
  set: (key: string, value: string) => void;
  Field: ComponentType<FieldProps>;
  MaskedKeyField: ComponentType<MaskedKeyFieldProps>;
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

export interface ScoutTopSettingsContext {
  form: SettingsForm;
  set: (key: string, value: string) => void;
  Field: ComponentType<FieldProps>;
  MaskedKeyField: ComponentType<MaskedKeyFieldProps>;
  checkProwlarrHealth: () => Promise<void>;
  checkingProwlarrHealth: boolean;
  prowlarrHealth: ProwlarrHealth;
}
