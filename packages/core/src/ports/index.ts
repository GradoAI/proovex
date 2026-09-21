import type { Sha256Digest } from '@proovex/contracts';

export interface Clock {
  now(): string;
}

export interface Digester {
  sha256(text: string): Sha256Digest;
}
