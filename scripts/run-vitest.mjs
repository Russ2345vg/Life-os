import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const vitestCliPath = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const productConfigPath = fileURLToPath(new URL('../vitest.config.ts', import.meta.url));
const infrastructureConfigPath = fileURLToPath(
  new URL('../vitest.infrastructure.config.ts', import.meta.url),
);
const alphaConfigPath = fileURLToPath(new URL('../vitest.alpha.config.ts', import.meta.url));

const MODE_SETTINGS = Object.freeze({
  target: { timeoutMs: 120_000, configPath: productConfigPath, filters: [] },
  fast: {
    timeoutMs: 180_000,
    configPath: productConfigPath,
    filters: ['src/domain', 'src/application', 'src/shared'],
  },
  full: { timeoutMs: 300_000, configPath: productConfigPath, filters: [] },
  infra: { timeoutMs: 120_000, configPath: infrastructureConfigPath, filters: [] },
  alpha: { timeoutMs: 60_000, configPath: alphaConfigPath, filters: [] },
});

export function resolveVitestInvocation(mode, selectors) {
  const settings = MODE_SETTINGS[mode];
  if (settings === undefined) {
    throw new Error(`Unknown Vitest mode: ${mode}.`);
  }

  validateNonInteractiveArguments(selectors);
  if (mode === 'target' && !selectors.some(isTestFileSelector)) {
    throw new Error('test:target requires at least one .test.ts or .test.tsx selector.');
  }

  return {
    stage: `vitest:${mode}`,
    command: process.execPath,
    args: [
      vitestCliPath,
      'run',
      '--config',
      settings.configPath,
      ...settings.filters,
      ...selectors,
    ],
    cwd: repoRoot,
    env: process.env,
    timeoutMs: settings.timeoutMs,
    shutdownTimeoutMs: 10_000,
  };
}

export async function runVitestMode(mode, selectors, options = {}) {
  const invocation = resolveVitestInvocation(mode, selectors);
  return runBoundedProcess({
    ...invocation,
    abortSignal: options.abortSignal,
    abortExitCode: options.abortExitCode,
    writeLine: options.writeLine,
  });
}

async function main() {
  const [mode, ...selectors] = process.argv.slice(2);
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
    const result = await runVitestMode(mode, selectors, {
      abortSignal: controller.signal,
      abortExitCode: 1,
    });
    process.exitCode =
      receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  }
}

function validateNonInteractiveArguments(arguments_) {
  for (const argument of arguments_) {
    const configOverride =
      argument === '--config' ||
      argument.startsWith('--config=') ||
      argument === '-c' ||
      (argument.startsWith('-c') && !argument.startsWith('--'));
    if (
      configOverride ||
      argument === '-w' ||
      argument === '--ui' ||
      argument.startsWith('--ui=') ||
      argument === '--watch' ||
      argument.startsWith('--watch=') ||
      argument === '--retry' ||
      argument.startsWith('--retry=')
    ) {
      throw new Error(`Unsafe Vitest argument is not allowed: ${argument}.`);
    }
  }
}

function isTestFileSelector(argument) {
  if (argument.startsWith('-')) return false;
  return /\.test\.tsx?$/u.test(argument.replaceAll('\\', '/'));
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
  await main();
}
