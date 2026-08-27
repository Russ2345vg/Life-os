import console from 'node:console';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';

export const VERIFY_OVERALL_TIMEOUT_MS = 1_800_000;

export function createProductionStages(options = {}) {
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (typeof npmExecPath !== 'string' || npmExecPath.trim().length === 0) {
    throw new Error('verify requires npm_execpath; start it with `npm run verify`.');
  }

  const npmStage = (name, script, timeoutMs) => ({
    name,
    command: process.execPath,
    args: [npmExecPath, 'run', script],
    timeoutMs,
  });

  return [
    npmStage('typecheck', 'typecheck', 180_000),
    npmStage('lint', 'lint', 180_000),
    npmStage('test', 'test', 360_000),
    npmStage('test:infra', 'test:infra', 180_000),
    npmStage('test:alpha', 'test:alpha', 90_000),
    npmStage('test:e2e', 'test:e2e', 1_260_000),
    npmStage('build', 'build', 360_000),
    npmStage('format:check', 'format:check', 180_000),
    {
      name: 'git:diff-check',
      command: 'git',
      args: ['diff', '--check'],
      timeoutMs: 60_000,
    },
  ];
}

export async function runVerification(options) {
  validateVerification(options);

  const writeLine = options.writeLine ?? console.log;
  const startedAt = performance.now();
  const deadline = startedAt + options.overallTimeoutMs;
  const results = [];

  writeLine(
    `[verify] START — ${options.stages.length} stages — overall deadline ${options.overallTimeoutMs}ms`,
  );

  for (const stage of options.stages) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) {
      const result = overallTimeoutResult(stage.name, performance.now() - startedAt);
      results.push(result);
      writeLine(
        `[verify:${stage.name}] TIMEOUT — overall deadline ${options.overallTimeoutMs}ms expired before stage start`,
      );
      printSummary(results, writeLine);
      return verificationResult(124, startedAt, results, true);
    }

    const stageResult = await runBoundedProcess({
      stage: `verify:${stage.name}`,
      command: stage.command,
      args: stage.args,
      cwd: options.cwd,
      env: options.env,
      timeoutMs: Math.min(stage.timeoutMs, remainingMs),
      shutdownTimeoutMs: options.shutdownTimeoutMs,
      abortSignal: options.abortSignal,
      abortExitCode: options.abortExitCode,
      writeLine,
    });
    results.push(stageResult);

    if (stageResult.exitCode !== 0) {
      printSummary(results, writeLine);
      return verificationResult(stageResult.exitCode, startedAt, results, stageResult.timedOut);
    }
  }

  printSummary(results, writeLine);
  return verificationResult(0, startedAt, results, false);
}

function validateVerification(options) {
  if (!Array.isArray(options.stages) || options.stages.length === 0) {
    throw new Error('verify requires at least one stage.');
  }
  if (!Number.isFinite(options.overallTimeoutMs) || options.overallTimeoutMs <= 0) {
    throw new Error('verify overallTimeoutMs must be a positive number.');
  }
  for (const stage of options.stages) {
    if (typeof stage.name !== 'string' || stage.name.trim().length === 0) {
      throw new Error('verify stage name must be a non-empty string.');
    }
    if (typeof stage.command !== 'string' || stage.command.trim().length === 0) {
      throw new Error(`verify stage command for ${stage.name} must be a non-empty string.`);
    }
    if (!Array.isArray(stage.args)) {
      throw new Error(`verify stage args for ${stage.name} must be an array.`);
    }
    if (!Number.isFinite(stage.timeoutMs) || stage.timeoutMs <= 0) {
      throw new Error(`verify stage timeout for ${stage.name} must be a positive number.`);
    }
  }
}

function printSummary(results, writeLine) {
  writeLine('[verify] SUMMARY');
  writeLine('Stage | Time | Result');
  for (const result of results) {
    const status = result.timedOut
      ? `TIMEOUT (${result.exitCode})`
      : result.exitCode === 0
        ? 'PASS'
        : `FAIL (${result.exitCode})`;
    writeLine(`${result.stage} | ${formatDuration(result.durationMs)} | ${status}`);
  }
}

function verificationResult(exitCode, startedAt, results, timedOut) {
  return {
    exitCode,
    durationMs: performance.now() - startedAt,
    results,
    timedOut,
  };
}

function overallTimeoutResult(stageName, durationMs) {
  return {
    stage: `verify:${stageName}`,
    commandLine: '',
    durationMs,
    exitCode: 124,
    signal: null,
    timedOut: true,
    aborted: false,
    error: 'Overall verify deadline expired.',
  };
}

function formatDuration(durationMs) {
  return `${(durationMs / 1_000).toFixed(2)}s`;
}

const isCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
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
    const result = await runVerification({
      stages: createProductionStages(),
      cwd: process.cwd(),
      env: process.env,
      overallTimeoutMs: VERIFY_OVERALL_TIMEOUT_MS,
      shutdownTimeoutMs: 10_000,
      abortSignal: abortController.signal,
      abortExitCode: 130,
    });
    process.exitCode = receivedSignal === 'SIGTERM' ? 143 : result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : 1;
  } finally {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  }
}
