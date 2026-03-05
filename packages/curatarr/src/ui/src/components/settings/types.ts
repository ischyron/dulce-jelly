import type { ComponentType } from 'react';

export interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  tooltip?: string;
}

export interface MaskedKeyFieldProps {
  label: string;
  name: string;
  maskedValue: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

export type FieldComponent = ComponentType<FieldProps>;
export type MaskedKeyFieldComponent = ComponentType<MaskedKeyFieldProps>;
