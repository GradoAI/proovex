import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalize, ProovexError, SchemaVersionSchema } from '@proovex/contracts';

test('canonicalize sorts keys and is stable across key order', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
});

test('canonicalize rejects non-finite numbers with a stable code', () => {
  assert.throws(
    () => canonicalize(Number.NaN),
    (error: unknown) => error instanceof ProovexError && error.code === 'kernel:non-finite-number',
  );
});

test('schema version must be a positive integer', () => {
  assert.equal(SchemaVersionSchema.safeParse(1).success, true);
  assert.equal(SchemaVersionSchema.safeParse(0).success, false);
});
