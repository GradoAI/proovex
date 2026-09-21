import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Digester, digestCanonical } from '@proovex/core';

test('digestCanonical hashes canonical bytes through the Digester port', () => {
  const seen: string[] = [];
  const digester: Digester = {
    sha256: (text) => {
      seen.push(text);
      return `sha256:${text.length.toString(16).padStart(64, '0')}`;
    },
  };
  assert.equal(
    digestCanonical(digester, { b: 1, a: 2 }),
    digestCanonical(digester, { a: 2, b: 1 }),
  );
  assert.deepEqual(seen, ['{"a":2,"b":1}', '{"a":2,"b":1}']);
});
