import { spawn } from 'node:child_process';
import process from 'node:process';
import { setInterval } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

const port = process.argv[2];
const serverPath = fileURLToPath(new URL('./http-server.mjs', import.meta.url));

spawn(process.execPath, [serverPath, port, 'fixture-descendant'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

process.stdout.write('fixture-tree:ready\n');
setInterval(() => {}, 1_000);
