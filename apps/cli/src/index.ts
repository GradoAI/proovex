import { SchemaVersionSchema } from '@proovex/contracts';
import { digestCanonical } from '@proovex/core';
import { nodeDigester, systemClock } from '@proovex/infrastructure-memory';

export interface FoundationInfo {
  readonly packages: readonly string[];
  readonly schema_version_valid: boolean;
  readonly probe_digest: string;
  readonly recorded_at: string;
}

export function foundationInfo(): FoundationInfo {
  return {
    packages: [
      '@proovex/contracts',
      '@proovex/core',
      '@proovex/infrastructure-memory',
      '@proovex/cli',
    ],
    schema_version_valid: SchemaVersionSchema.safeParse(1).success,
    probe_digest: digestCanonical(nodeDigester, { proovex: 'foundation' }),
    recorded_at: systemClock.now(),
  };
}
