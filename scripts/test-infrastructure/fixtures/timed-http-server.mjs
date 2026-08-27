import { createServer } from 'node:http';
import process from 'node:process';
import { setTimeout } from 'node:timers';

const port = Number(process.argv[2]);
const lifetimeMs = Number(process.argv[3] ?? '5000');
const server = createServer((_request, response) => {
  response.writeHead(200);
  response.end('fixture-timed');
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`fixture-timed-http:ready:${port}\n`);
});
setTimeout(() => server.close(), lifetimeMs);
