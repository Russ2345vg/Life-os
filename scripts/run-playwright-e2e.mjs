import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { runManagedE2e } from './test-infrastructure/e2e-lifecycle.mjs';
import { planE2eRun } from './test-infrastructure/e2e-shards.mjs';

const host = '127.0.0.1';
const viteCliPath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const playwrightCliPath = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const playwrightConfigPath = fileURLToPath(
  new URL('../playwright.managed.config.ts', import.meta.url),
);
const forwardedArguments = process.argv.slice(2);
const { port, shardIndex } = planE2eRun(forwardedArguments);
const progressFilePath = fileURLToPath(
  new URL(
    `../node_modules/.tmp/lifeos-e2e-progress${shardIndex === null ? '' : `-shard-${shardIndex}`}.json`,
    import.meta.url,
  ),
);
const listOnly = forwardedArguments.includes('--list');
const abortController = new globalThis.AbortController();
let receivedSignal = null;

const handleSigint = () => {
  receivedSignal = 'SIGINT';
  abortController.abort(receivedSignal);
};
const handleSigterm = () => {
  receivedSignal = 'SIGTERM';
  abortController.abort(receivedSignal);
};

process.once('SIGINT', handleSigint);
process.once('SIGTERM', handleSigterm);

try {
  const result = await runManagedE2e({
    host,
    port,
    serverUrl: `http://${host}:${port}`,
    serverCommand: {
      command: process.execPath,
      args: [viteCliPath, '--host', host, '--port', String(port), '--strictPort'],
    },
    playwrightCommand: {
      command: process.execPath,
      args: [
        playwrightCliPath,
        'test',
        '--config',
        playwrightConfigPath,
        ...(listOnly ? ['--reporter=list'] : []),
      ],
    },
    playwrightArguments: forwardedArguments,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      LIFEOS_E2E_PORT: String(port),
      LIFEOS_E2E_SHARD_INDEX: shardIndex === null ? '' : String(shardIndex),
      LIFEOS_E2E_PROGRESS_FILE: progressFilePath,
    },
    startupTimeoutMs: 60_000,
    playwrightTimeoutMs: listOnly ? 120_000 : 1_800_000,
    shutdownTimeoutMs: 10_000,
    abortSignal: abortController.signal,
    abortExitCode: 130,
    progressFilePath,
  });

  process.exitCode = receivedSignal === 'SIGTERM' ? 143 : result.exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 1;
} finally {
  process.removeListener('SIGINT', handleSigint);
  process.removeListener('SIGTERM', handleSigterm);
}
