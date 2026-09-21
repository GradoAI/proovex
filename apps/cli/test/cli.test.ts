import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { foundationInfo } from '@proovex/cli';

test('foundationInfo composes the three lower packages through public entries', () => {
  const info = foundationInfo();
  assert.equal(info.packages.length, 4);
  assert.equal(info.schema_version_valid, true);
  assert.match(info.probe_digest, /^sha256:[0-9a-f]{64}$/);
});

test('cli main prints JSON and rejects unknown usage with exit code 2', () => {
  const main = fileURLToPath(new URL('../src/main.ts', import.meta.url));
  const out = JSON.parse(
    execFileSync(process.execPath, [main, 'foundation', 'info', '--json'], { encoding: 'utf8' }),
  );
  assert.equal(out.packages[3], '@proovex/cli');
  assert.throws(
    () => execFileSync(process.execPath, [main, 'nope'], { stdio: 'pipe' }),
    (error: { status?: number }) => error.status === 2,
  );
});
