import { createConnection, createServer } from 'node:net';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { runBoundedProcess } from './process-runner.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const exitFixturePath = fileURLToPath(new URL('./fixtures/exit.mjs', import.meta.url));
const hangFixturePath = fileURLToPath(new URL('./fixtures/hang.mjs', import.meta.url));
const treeParentFixturePath = fileURLToPath(new URL('./fixtures/tree-parent.mjs', import.meta.url));
const normalExitParentFixturePath = fileURLToPath(
  new URL('./fixtures/normal-exit-parent.mjs', import.meta.url),
);

describe('bounded owned-process runner', () => {
  test('returns the child exit code and stage duration', async () => {
    const lines = [];

    const result = await runBoundedProcess({
      stage: 'exit-seven',
      command: process.execPath,
      args: [exitFixturePath, '7'],
      cwd: repoRoot,
      env: process.env,
      timeoutMs: 2_000,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(7);
    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(lines.join('\n')).toContain('[exit-seven] FAIL');
    expect(lines.join('\n')).toContain('exit 7');
  });

  test('reports a spawn error without waiting for the deadline', async () => {
    const lines = [];
    const startedAt = Date.now();

    const result = await runBoundedProcess({
      stage: 'missing-command',
      command: 'lifeos-command-that-does-not-exist',
      args: [],
      cwd: repoRoot,
      env: process.env,
      timeoutMs: 2_000,
      writeLine: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(lines.join('\n')).toContain('[missing-command] SPAWN ERROR');
  });

  test('leaves no owned non-detached descendant after its parent exits normally', async () => {
    const port = await reserveFreePort();
    try {
      const result = await runBoundedProcess({
        stage: 'normal-exit-tree',
        command: process.execPath,
        args: [normalExitParentFixturePath, String(port)],
        cwd: repoRoot,
        env: process.env,
        timeoutMs: 3_000,
        shutdownTimeoutMs: 2_000,
        writeLine: () => {},
      });

      expect(result).toMatchObject({ exitCode: 0, timedOut: false });
      await expectPortState(port, false, 2_000);
    } finally {
      await expectPortState(port, false, 6_000);
    }
  }, 12_000);

  test('times out a hung child with code 124 and diagnostics', async () => {
    const lines = [];

    const result = await runBoundedProcess({
      stage: 'hung-stage',
      command: process.execPath,
      args: [hangFixturePath],
      cwd: repoRoot,
      env: process.env,
      timeoutMs: 250,
      shutdownTimeoutMs: 2_000,
      writeLine: (line) => lines.push(line),
    });

    expect(result).toMatchObject({ exitCode: 124, timedOut: true, aborted: false });
    expect(lines.join('\n')).toContain('[hung-stage] TIMEOUT');
    expect(lines.join('\n')).toContain('250ms');
    expect(lines.join('\n')).toContain(JSON.stringify(hangFixturePath));
  });

  test('keeps timeout code 124 and exposes a process-tree cleanup failure', async () => {
    const lines = [];
    const cleanupMessage = 'fixture tree cleanup failed';

    const result = await runBoundedProcess({
      stage: 'cleanup-failure',
      command: process.execPath,
      args: [hangFixturePath],
      cwd: repoRoot,
      env: process.env,
      timeoutMs: 250,
      shutdownTimeoutMs: 2_000,
      terminateProcessTree: async (child) => {
        const exited =
          child.exitCode !== null || child.signalCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGKILL');
        await exited;
        throw new Error(cleanupMessage);
      },
      writeLine: (line) => lines.push(line),
    });

    expect(result).toMatchObject({
      exitCode: 124,
      timedOut: true,
      error: cleanupMessage,
    });
    expect(lines.join('\n')).toContain('[cleanup-failure] CLEANUP ERROR');
    expect(lines.join('\n')).toContain(cleanupMessage);
  });

  test('aborts a hung child with the requested signal exit code', async () => {
    const lines = [];
    const controller = new globalThis.AbortController();
    const abortTimer = setTimeout(() => controller.abort('SIGINT'), 100);

    try {
      const result = await runBoundedProcess({
        stage: 'interrupted-stage',
        command: process.execPath,
        args: [hangFixturePath],
        cwd: repoRoot,
        env: process.env,
        timeoutMs: 2_000,
        shutdownTimeoutMs: 2_000,
        abortSignal: controller.signal,
        abortExitCode: 130,
        writeLine: (line) => lines.push(line),
      });

      expect(result).toMatchObject({ exitCode: 130, timedOut: false, aborted: true });
      expect(lines.join('\n')).toContain('[interrupted-stage] INTERRUPTED');
    } finally {
      clearTimeout(abortTimer);
    }
  });

  test.runIf(process.platform === 'win32')(
    'kills an owned Windows descendant tree instead of leaving its port occupied',
    async () => {
      const port = await reserveFreePort();
      const runPromise = runBoundedProcess({
        stage: 'owned-tree',
        command: process.execPath,
        args: [treeParentFixturePath, String(port)],
        cwd: repoRoot,
        env: process.env,
        timeoutMs: 1_500,
        shutdownTimeoutMs: 3_000,
        writeLine: () => {},
      });

      await expectPortState(port, true, 1_000);
      const result = await runPromise;

      expect(result).toMatchObject({ exitCode: 124, timedOut: true });
      await expectPortState(port, false, 2_000);

      const proof = createServer();
      await new Promise((resolve, reject) => {
        proof.once('error', reject);
        proof.listen(port, '127.0.0.1', resolve);
      });
      await new Promise((resolve, reject) => {
        proof.close((error) => (error ? reject(error) : resolve()));
      });
    },
    10_000,
  );
});

async function reserveFreePort() {
  const server = createServer();
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
    const connection = createConnection({ host: '127.0.0.1', port });
    connection.once('connect', () => {
      connection.destroy();
      resolve(true);
    });
    connection.once('error', () => resolve(false));
    connection.setTimeout(250, () => {
      connection.destroy();
      resolve(false);
    });
  });
}
