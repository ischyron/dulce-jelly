import { green, red, yellow, dim, cyan } from 'colorette';

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return (str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

export { green, red, yellow, dim, cyan };
