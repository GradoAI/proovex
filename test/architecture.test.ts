import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkArchitecture,
  IMPLEMENTED_RULES,
  NOT_COVERED_RULES,
} from '../scripts/check-architecture.ts';

const fixtures = fileURLToPath(new URL('../architecture/fixtures/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

for (const kind of ['positive', 'negative']) {
  for (const name of readdirSync(join(fixtures, kind)).sort()) {
    test(`fixture ${kind}/${name} matches exact expected status and rule set`, () => {
      const expected = JSON.parse(
        readFileSync(join(fixtures, kind, name, 'expect.json'), 'utf8'),
      ) as {
        status: string;
        rules: string[];
      };
      const result = checkArchitecture(join(fixtures, kind, name, 'tree'));
      assert.equal(result.status, expected.status);
      assert.deepEqual(
        [...new Set(result.violations.map((v) => v.rule))].sort(),
        [...expected.rules].sort(),
      );
      if (kind === 'negative') assert.equal(result.violations.length, 1);
    });
  }
}

test('production tree passes the six implemented rules', () => {
  const result = checkArchitecture(repoRoot);
  assert.deepEqual(result.violations, []);
});

test('architecture validation is independent of checkout directory name', () => {
  const temp = mkdtempSync(join('/tmp', 'proovex-path-test-'));
  try {
    cpSync(repoRoot, temp, { recursive: true, filter: (source) => !source.includes('/node_modules/') && !source.includes('/.git/') });
    assert.deepEqual(checkArchitecture(repoRoot), checkArchitecture(temp));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('slice 1 declares exactly six implemented rules and eleven not covered', () => {
  assert.equal(IMPLEMENTED_RULES.length, 6);
  assert.equal(NOT_COVERED_RULES.length, 11);
});
