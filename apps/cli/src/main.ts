import { parseArgs } from 'node:util';
import { foundationInfo } from './index.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'boolean', default: false } },
});

if (positionals.join(' ') !== 'foundation info' || values.json !== true) {
  process.stderr.write('usage: proovex foundation info --json\n');
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify(foundationInfo())}\n`);
}
