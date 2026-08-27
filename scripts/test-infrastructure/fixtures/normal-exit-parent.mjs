import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

const port = process.argv[2];
const serverPath = fileURLToPath(new URL('./timed-http-server.mjs', import.meta.url));
spawn(process.execPath, [serverPath, port, '5000'], { stdio: 'inherit' });

setTimeout(() => process.exit(0), 500);
