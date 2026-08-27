import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const typescriptCliPath = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);
const eslintCliPath = fileURLToPath(
  new URL('../node_modules/eslint/bin/eslint.js', import.meta.url),
);
const prettierCliPath = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
);
const viteCliPath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const CHECKS = Object.freeze({
  typecheck: [check('check:typecheck', typescriptCliPath, ['-b', '--pretty', 'false'], 180_000)],
  lint: [check('check:lint', eslintCliPath, ['.'], 180_000)],
  'format-check': [check('check:format', prettierCliPath, ['--check', '.'], 180_000)],
  build: [
    check('check:build:typecheck', typescriptCliPath, ['-b'], 240_000),
    check('check:build:vite', viteCliPath, ['build'], 120_000),
  ],
});

export function resolveCheckInvocations(mode) {
  const invocations = CHECKS[mode];
  if (invocations === undefined) throw new Error(`Unknown bounded check mode: ${mode}.`);
  return invocations;
}

export async function runCheckMode(mode, options = {}) {
  const results = [];
  for (const invocation of resolveCheckInvocations(mode)) {
    const result = await runBoundedProcess({
      ...invocation,
      abortSignal: options.abortSignal,
      abortExitCode: options.abortExitCode,
      writeLine: options.writeLine,
    });
    results.push(result);
    if (result.exitCode !== 0) return { exitCode: result.exitCode, results };
  }
  return { exitCode: 0, results };
}

function check(stage, cliPath, args, timeoutMs) {
  return {
    stage,
    command: process.execPath,
    args: [cliPath, ...args],
    cwd: repoRoot,
    env: process.env,
    timeoutMs,
    shutdownTimeoutMs: 10_000,
  };
}

async function main() {
  const [mode, ...unexpected] = process.argv.slice(2);
  if (unexpected.length > 0) throw new Error(`Unexpected check arguments: ${unexpected.join(' ')}`);

  const controller = new globalThis.AbortController();
  let receivedSignal = null;
  const handleSignal = (signal) => {
    receivedSignal = signal;
    if (!controller.signal.aborted) controller.abort(signal);
  };
  const handleSigint = () => handleSignal('SIGINT');
  const handleSigterm = () => handleSignal('SIGTERM');
  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  try {
    const result = await runCheckMode(mode, {
      abortSignal: controller.signal,
      abortExitCode: 1,
    });
    process.exitCode =
      receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : result.exitCode;
  } finally {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  }
}

function isMainModule() {
  if (process.argv[1] === undefined) return false;
  const invokedPath = resolve(process.argv[1]);
  const modulePath = fileURLToPath(import.meta.url);
  return process.platform === 'win32'
    ? invokedPath.toLowerCase() === modulePath.toLowerCase()
    : invokedPath === modulePath;
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
