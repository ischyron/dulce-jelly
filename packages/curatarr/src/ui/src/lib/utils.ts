import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges class names (incl. conditionals) and resolves Tailwind conflicts so later classes win (e.g. px-2 + px-4 → px-4). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
