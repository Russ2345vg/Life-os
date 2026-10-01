import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { runManagedE2e } from './test-infrastructure/e2e-lifecycle.mjs';

const host = '127.0.0.1';
const port = 4173;
const viteCliPath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const playwrightCliPath = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const playwrightConfigPath = fileURLToPath(
  new URL('../playwright.managed.config.ts', import.meta.url),
);
const progressFilePath = fileURLToPath(
  new URL('../node_modules/.tmp/lifeos-e2e-progress.json', import.meta.url),
);
const forwardedArguments = process.argv.slice(2);
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
    env: { ...process.env, LIFEOS_E2E_PROGRESS_FILE: progressFilePath },
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
