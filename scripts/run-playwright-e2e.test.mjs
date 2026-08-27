import { createServer } from 'node:http';
import { get } from 'node:http';
import { rmSync } from 'node:fs';
import { createConnection, createServer as createTcpServer } from 'node:net';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  runManagedE2e,
  validatePlaywrightArguments,
} from './test-infrastructure/e2e-lifecycle.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const exitFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/exit.mjs', import.meta.url),
);
const hangFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/hang.mjs', import.meta.url),
);
const httpServerFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/http-server.mjs', import.meta.url),
);
const treeParentFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/tree-parent.mjs', import.meta.url),
);
const progressHangFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/progress-hang.mjs', import.meta.url),
);
const progressFilePath = fileURLToPath(
  new URL('../node_modules/.tmp/e2e-lifecycle-progress.json', import.meta.url),
);

describe('managed E2E lifecycle', () => {
  test.each([
    ['long config', ['--config', 'playwright.config.ts']],
    ['joined config', ['--config=playwright.config.ts']],
    ['short config', ['-c', 'playwright.config.ts']],
    ['joined short config', ['-cplaywright.config.ts']],
    ['UI', ['--ui']],
    ['UI host', ['--ui-host=127.0.0.1']],
    ['debug', ['--debug']],
    ['headed', ['--headed']],
    ['reporter', ['--reporter', 'dot']],
    ['joined reporter', ['--reporter=dot']],
    ['retries', ['--retries', '99']],
    ['joined retries', ['--retries=99']],
  ])('rejects an interactive or unmanaged argument: %s', (_label, arguments_) => {
    expect(() => validatePlaywrightArguments(arguments_)).toThrow(
      /Managed E2E lifecycle does not accept/u,
    );
  });

  test('refuses an occupied port without stopping its owner', async () => {
    const owner = await startFixtureServer();
    const lines = [];

    try {
      const result = await runManagedE2e(
        fixtureOptions({ port: owner.port, writeLine: (line) => lines.push(line) }),
      );

      expect(result).toMatchObject({ exitCode: 1, stage: 'port-check' });
      expect(lines.join('\n')).toContain('refusing to stop or reuse its owner');
      expect(await requestText(owner.port)).toBe('fixture-owner');
    } finally {
      await owner.close();
    }
  });

  test('runs a successful Playwright list process and releases the Vite port', async () => {
    const port = await reserveFreePort();
    const lines = [];

    const result = await runManagedE2e(
      fixtureOptions({
        port,
        playwrightArguments: ['--list'],
        writeLine: (line) => lines.push(line),
      }),
    );

    expect(result).toMatchObject({ exitCode: 0, stage: 'playwright', timedOut: false });
    expect(lines.join('\n')).toContain('[e2e:vite-startup] READY');
    await expectPortState(port, false, 2_000);
  });

  test('preserves a nonzero Playwright exit and still releases the Vite port', async () => {
    const port = await reserveFreePort();

    const result = await runManagedE2e(
      fixtureOptions({
        port,
        playwrightCommand: { command: process.execPath, args: [exitFixturePath, '7'] },
      }),
    );

    expect(result).toMatchObject({ exitCode: 7, stage: 'playwright' });
    await expectPortState(port, false, 2_000);
  });

  test('reports a Vite spawn error without waiting for startup timeout', async () => {
    const port = await reserveFreePort();
    const startedAt = Date.now();

    const result = await runManagedE2e(
      fixtureOptions({
        port,
        serverCommand: { command: 'lifeos-vite-that-does-not-exist', args: [] },
      }),
    );

    expect(result).toMatchObject({ exitCode: 1, stage: 'vite-startup' });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    await expectPortState(port, false, 1_000);
  });

  test('times out Vite startup and releases its owned process', async () => {
    const port = await reserveFreePort();
    const lines = [];

    const result = await runManagedE2e(
      fixtureOptions({
        port,
        serverCommand: { command: process.execPath, args: [hangFixturePath] },
        startupTimeoutMs: 500,
        writeLine: (line) => lines.push(line),
      }),
    );

    expect(result).toMatchObject({ exitCode: 124, stage: 'vite-startup', timedOut: true });
    expect(lines.join('\n')).toContain('Timed out after 500ms');
    await expectPortState(port, false, 2_000);
  });

  test('reports the current test and project on a Playwright process timeout', async () => {
    const port = await reserveFreePort();
    const lines = [];

    try {
      const result = await runManagedE2e(
        fixtureOptions({
          port,
          playwrightCommand: { command: process.execPath, args: [progressHangFixturePath] },
          playwrightTimeoutMs: 500,
          progressFilePath,
          env: { ...process.env, LIFEOS_E2E_PROGRESS_FILE: progressFilePath },
          writeLine: (line) => lines.push(line),
        }),
      );

      expect(result).toMatchObject({ exitCode: 124, stage: 'playwright', timedOut: true });
      expect(lines.join('\n')).toContain(
        '[e2e:timeout] TIMEOUT — stage playwright — current 92/142 [mobile-chrome] WALK-10 capture keeps timer running',
      );
    } finally {
      rmSync(progressFilePath, { force: true });
    }
  });

  test('times out Playwright, kills owned descendants, and releases the Vite port', async () => {
    const port = await reserveFreePort();
    const descendantPort = await reserveFreePort();

    const result = await runManagedE2e(
      fixtureOptions({
        port,
        playwrightCommand: {
          command: process.execPath,
          args: [treeParentFixturePath, String(descendantPort)],
        },
        playwrightTimeoutMs: 1_500,
      }),
    );

    expect(result).toMatchObject({ exitCode: 124, stage: 'playwright', timedOut: true });
    await expectPortState(port, false, 2_000);
    await expectPortState(descendantPort, false, 2_000);
  }, 15_000);

  test('interrupts Playwright through the same teardown and returns signal exit code', async () => {
    const port = await reserveFreePort();
    const controller = new globalThis.AbortController();
    const abortTimer = setTimeout(() => controller.abort('SIGINT'), 500);

    try {
      const result = await runManagedE2e(
        fixtureOptions({
          port,
          playwrightCommand: { command: process.execPath, args: [hangFixturePath] },
          abortSignal: controller.signal,
          abortExitCode: 130,
        }),
      );

      expect(result).toMatchObject({ exitCode: 130, stage: 'playwright', aborted: true });
      await expectPortState(port, false, 2_000);
    } finally {
      clearTimeout(abortTimer);
    }
  }, 15_000);
});

function fixtureOptions(overrides) {
  const port = overrides.port;
  return {
    host: '127.0.0.1',
    port,
    serverUrl: `http://127.0.0.1:${port}`,
    serverCommand: overrides.serverCommand ?? {
      command: process.execPath,
      args: [httpServerFixturePath, String(port), 'fixture-vite'],
    },
    playwrightCommand: overrides.playwrightCommand ?? {
      command: process.execPath,
      args: [exitFixturePath, '0'],
    },
    playwrightArguments: overrides.playwrightArguments ?? [],
    cwd: repoRoot,
    env: overrides.env ?? process.env,
    startupTimeoutMs: overrides.startupTimeoutMs ?? 3_000,
    playwrightTimeoutMs: overrides.playwrightTimeoutMs ?? 3_000,
    shutdownTimeoutMs: 3_000,
    abortSignal: overrides.abortSignal,
    abortExitCode: overrides.abortExitCode,
    progressFilePath: overrides.progressFilePath,
    writeLine: overrides.writeLine ?? (() => {}),
  };
}

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('fixture-owner');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to start fixture owner.');
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function requestText(port) {
  return new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${port}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.once('end', () => resolve(body));
    });
    request.once('error', reject);
    request.setTimeout(1_000, () => request.destroy(new Error('Fixture request timed out.')));
  });
}

async function reserveFreePort() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to reserve a TCP port.');
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function expectPortState(port, expectedOpen, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await isPortOpen(port)) === expectedOpen) return;
    await delay(25);
  }
  expect(await isPortOpen(port)).toBe(expectedOpen);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(250, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
