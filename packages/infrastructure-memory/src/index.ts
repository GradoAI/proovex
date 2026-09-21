import { createHash } from 'node:crypto';
import type { Sha256Digest } from '@proovex/contracts';
import type { Clock, Digester } from '@proovex/core';

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export const nodeDigester: Digester = {
  sha256(text: string): Sha256Digest {
    return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
  },
};
