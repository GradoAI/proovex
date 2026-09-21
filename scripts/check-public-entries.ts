// Build-equivalent smoke: every member package public entry imports and exposes named exports.
const entries = [
  '@proovex/contracts',
  '@proovex/core',
  '@proovex/infrastructure-memory',
  '@proovex/cli',
];
const report: Array<{ entry: string; exports: string[] }> = [];
for (const entry of entries) {
  const module = (await import(entry)) as Record<string, unknown>;
  const names = Object.keys(module).sort();
  if (names.length === 0) throw new Error(`public-entry:empty:${entry}`);
  report.push({ entry, exports: names });
}
process.stdout.write(`${JSON.stringify({ status: 'PASS', entries: report })}\n`);
