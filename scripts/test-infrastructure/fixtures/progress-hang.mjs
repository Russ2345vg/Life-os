import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { setInterval } from 'node:timers';

const progressFilePath = process.env.LIFEOS_E2E_PROGRESS_FILE;
if (progressFilePath === undefined) throw new Error('Missing LIFEOS_E2E_PROGRESS_FILE.');

writeFileSync(
  progressFilePath,
  JSON.stringify({
    current: {
      index: 92,
      total: 142,
      project: 'mobile-chrome',
      title: 'WALK-10 capture keeps timer running',
      startedAt: new Date().toISOString(),
    },
  }),
);
process.stdout.write('fixture-progress-hang:ready\n');
setInterval(() => {}, 1_000);
