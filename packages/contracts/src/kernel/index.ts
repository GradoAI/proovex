import { z } from 'zod';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Sha256Digest = `sha256:${string}`;

export const SchemaVersionSchema = z.number().int().positive();

export class ProovexError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProovexError';
    this.code = code;
  }
}

// RFC 8785 canonical JSON for JSON values: keys sorted by UTF-16 code units.
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ProovexError('kernel:non-finite-number', 'canonical JSON requires finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`).join(',')}}`;
}
