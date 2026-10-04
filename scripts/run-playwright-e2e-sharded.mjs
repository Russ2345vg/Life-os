import console from 'node:console';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { buildShardPlans } from './test-infrastructure/e2e-shards.mjs';
import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryRoot = join(root, 'node_modules', '.tmp');
const runnerPath = join(root, 'scripts', 'run-playwright-e2e.mjs');
const playwrightCliPath = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const forwardedArguments = process.argv.slice(2);
const abortController = new globalThis.AbortController();
let receivedSignal = null;

function interrupt(signal) {
  receivedSignal = signal;
  abortController.abort(signal);
}

const handleSigint = () => interrupt('SIGINT');
const handleSigterm = () => interrupt('SIGTERM');
process.once('SIGINT', handleSigint);
process.once('SIGTERM', handleSigterm);

try {
  mkdirSync(temporaryRoot, { recursive: true });
  const runDirectory = mkdtempSync(join(temporaryRoot, 'lifeos-e2e-shards-'));
  const plans = buildShardPlans(runDirectory, forwardedArguments);
  const results = await Promise.all(
    plans.map((plan) =>
      runBoundedProcess({
        stage: `e2e:shard-${plan.index}`,
        command: process.execPath,
        args: [runnerPath, ...plan.args],
        cwd: root,
        env: { ...process.env, LIFEOS_E2E_BLOB_OUTPUT_FILE: plan.blobOutputFile },
        timeoutMs: 1_920_000,
        shutdownTimeoutMs: 15_000,
        abortSignal: abortController.signal,
        abortExitCode: 130,
      }),
    ),
  );
  const firstFailure = results.find((result) => result.exitCode !== 0);
  if (!abortController.signal.aborted) {
    if (plans.every((plan) => existsSync(plan.blobOutputFile))) {
      const merged = await runBoundedProcess({
        stage: 'e2e:merge-reports',
        command: process.execPath,
        args: [playwrightCliPath, 'merge-reports', '--reporter=html', runDirectory],
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_HTML_OPEN: 'never' },
        timeoutMs: 120_000,
        shutdownTimeoutMs: 10_000,
        abortSignal: abortController.signal,
        abortExitCode: 130,
      });
      process.exitCode = firstFailure?.exitCode ?? merged.exitCode;
    } else {
      console.error(`Shard report is missing; inspect ${runDirectory}.`);
      process.exitCode = firstFailure?.exitCode ?? 1;
    }
  } else {
    process.exitCode = firstFailure?.exitCode ?? 0;
  }
  console.log(`E2E shard artifacts: ${runDirectory}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', handleSigint);
  process.removeListener('SIGTERM', handleSigterm);
  if (receivedSignal === 'SIGTERM') process.exitCode = 143;
}
