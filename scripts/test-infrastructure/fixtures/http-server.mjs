import { createServer } from 'node:http';
import process from 'node:process';

const host = '127.0.0.1';
const port = Number(process.argv[2]);
const responseBody = process.argv[3] ?? 'fixture-owner';

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid fixture port: ${process.argv[2] ?? 'missing'}`);
}

const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end(responseBody);
});

server.listen(port, host, () => {
  process.stdout.write(`fixture-http:ready:${port}\n`);
});
