import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestCanonical } from '@proovex/core';
import { nodeDigester, systemClock } from '@proovex/infrastructure-memory';

test('nodeDigester implements the core Digester port with sha256 hex', () => {
  assert.equal(
    digestCanonical(nodeDigester, { a: 1 }),
    'sha256:015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
  );
});

test('systemClock returns an RFC 3339 UTC millisecond timestamp', () => {
  assert.match(systemClock.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
