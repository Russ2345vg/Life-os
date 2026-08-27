import { createConnection, createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { createProductionStages, runVerification } from './verify.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const exitFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/exit.mjs', import.meta.url),
);
const hangFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/hang.mjs', import.meta.url),
);
const treeParentFixturePath = fileURLToPath(
  new URL('./test-infrastructure/fixtures/tree-parent.mjs', import.meta.url),
);

describe('verify orchestrator', () => {
  test('runs successful stages sequentially and prints their summary', async () => {
    const lines = [];
    const result = await runVerification({
      stages: [fixtureStage('first', 0), fixtureStage('second', 0)],
      cwd: repoRoot,
      env: process.env,
      overallTimeoutMs: 5_000,
      writeLine: (line) => lines.push(line),
    });

    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.results.map((stage) => stage.stage)).toEqual(['verify:first', 'verify:second']);
    expect(lines.join('\n')).toContain('[verify] SUMMARY');
    expect(lines.join('\n')).toContain('verify:first');
  });

  test('stops on the first failure and preserves its exit code', async () => {
    const result = await runVerification({
      stages: [fixtureStage('pass', 0), fixtureStage('fail', 7), fixtureStage('not-run', 0)],
      cwd: repoRoot,
      env: process.env,
      overallTimeoutMs: 5_000,
      writeLine: () => {},
    });

    expect(result.exitCode).toBe(7);
    expect(result.results.map((stage) => stage.stage)).toEqual(['verify:pass', 'verify:fail']);
  });

  test('caps a stage with the overall deadline and reports timeout diagnostics', async () => {
    const lines = [];
    const result = await runVerification({
      stages: [
        {
          name: 'hung',
          command: process.execPath,
          args: [hangFixturePath],
          timeoutMs: 10_000,
        },
      ],
      cwd: repoRoot,
      env: process.env,
      overallTimeoutMs: 500,
      shutdownTimeoutMs: 3_000,
      writeLine: (line) => lines.push(line),
    });

    expect(result).toMatchObject({ exitCode: 124, timedOut: true });
    expect(result.results[0]).toMatchObject({ stage: 'verify:hung', timedOut: true });
    expect(lines.join('\n')).toMatch(/verify:hung.*TIMEOUT|TIMEOUT.*verify:hung/su);
    expect(lines.join('\n')).toContain('command:');
  }, 10_000);

  test.runIf(process.platform === 'win32')(
    'overall deadline terminates the complete owned Windows process tree',
    async () => {
      const port = await reserveFreePort();
      const lines = [];

      const runPromise = runVerification({
        stages: [
          {
            name: 'hung-tree',
            command: process.execPath,
            args: [treeParentFixturePath, String(port)],
            timeoutMs: 10_000,
          },
        ],
        cwd: repoRoot,
        env: process.env,
        overallTimeoutMs: 1_500,
        shutdownTimeoutMs: 3_000,
        writeLine: (line) => lines.push(line),
      });

      await expectPortState(port, true, 1_000);
      const result = await runPromise;

      expect(result).toMatchObject({ exitCode: 124, timedOut: true });
      expect(lines.join('\n')).toContain('[verify:hung-tree] TIMEOUT');
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

  test('rejects invalid stage and production npm configuration immediately', async () => {
    await expect(
      runVerification({
        stages: [{ name: '', command: process.execPath, args: [], timeoutMs: 1_000 }],
        cwd: repoRoot,
        env: process.env,
        overallTimeoutMs: 5_000,
      }),
    ).rejects.toThrow(/stage name/u);
    expect(() => createProductionStages({ npmExecPath: '' })).toThrow(/npm_execpath/u);
  });
});

function fixtureStage(name, exitCode) {
  return {
    name,
    command: process.execPath,
    args: [exitFixturePath, String(exitCode)],
    timeoutMs: 2_000,
  };
}

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
