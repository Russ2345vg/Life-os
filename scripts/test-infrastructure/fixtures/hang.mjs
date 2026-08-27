import process from 'node:process';
import { setInterval } from 'node:timers';

process.stdout.write('fixture-hang:ready\n');
setInterval(() => {}, 1_000);
