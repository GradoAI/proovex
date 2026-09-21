import { canonicalize, type JsonValue, type Sha256Digest } from '@proovex/contracts';
import type { Digester } from './ports/index.ts';

export type { Clock, Digester } from './ports/index.ts';

export function digestCanonical(digester: Digester, value: JsonValue): Sha256Digest {
  return digester.sha256(canonicalize(value));
}
