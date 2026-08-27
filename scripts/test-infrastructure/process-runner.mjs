import { spawn } from 'node:child_process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export async function runBoundedProcess(input) {
  const {
    stage,
    command,
    args = [],
    cwd,
    env,
    timeoutMs,
    shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    abortSignal,
    abortExitCode = 1,
    terminateProcessTree = terminateOwnedProcessTree,
    writeLine = console.log,
  } = input;

  validateInput({ stage, command, timeoutMs, shutdownTimeoutMs });

  const commandLine = formatCommand(command, args);
  const startedAt = performance.now();
  writeLine(`[${stage}] START — deadline ${timeoutMs}ms — command: ${commandLine}`);

  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    writeLine(`[${stage}] SPAWN ERROR — ${formatDuration(durationMs)} — ${errorMessage(error)}`);
    return result({ stage, commandLine, durationMs, exitCode: 1, error: errorMessage(error) });
  }

  let timeoutId;
  let abortListener;
  const childOutcome = waitForChildOutcome(child);
  const timeoutOutcome = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });
  const outcomes = [childOutcome, timeoutOutcome];

  if (abortSignal !== undefined) {
    outcomes.push(
      new Promise((resolve) => {
        abortListener = () => resolve({ kind: 'abort', reason: abortSignal.reason });
        if (abortSignal.aborted) {
          abortListener();
          return;
        }
        abortSignal.addEventListener('abort', abortListener, { once: true });
      }),
    );
  }

  try {
    const outcome = await Promise.race(outcomes);

    if (outcome.kind === 'timeout') {
      const cleanupError = await cleanupOwnedProcessTree(
        child,
        shutdownTimeoutMs,
        terminateProcessTree,
      );
      const durationMs = performance.now() - startedAt;
      if (cleanupError !== null) {
        writeLine(
          `[${stage}] CLEANUP ERROR — ${formatDuration(durationMs)} — ${cleanupError.message}`,
        );
      }
      writeLine(
        `[${stage}] TIMEOUT — deadline ${timeoutMs}ms — ${formatDuration(durationMs)} — command: ${commandLine}`,
      );
      return result({
        stage,
        commandLine,
        durationMs,
        exitCode: 124,
        timedOut: true,
        error: cleanupError?.message,
      });
    }

    if (outcome.kind === 'abort') {
      const cleanupError = await cleanupOwnedProcessTree(
        child,
        shutdownTimeoutMs,
        terminateProcessTree,
      );
      const durationMs = performance.now() - startedAt;
      if (cleanupError !== null) {
        writeLine(
          `[${stage}] CLEANUP ERROR — ${formatDuration(durationMs)} — ${cleanupError.message}`,
        );
      }
      const reason = typeof outcome.reason === 'string' ? ` — ${outcome.reason}` : '';
      writeLine(
        `[${stage}] INTERRUPTED — ${formatDuration(durationMs)}${reason} — command: ${commandLine}`,
      );
      return result({
        stage,
        commandLine,
        durationMs,
        exitCode: abortExitCode,
        aborted: true,
        error: cleanupError?.message,
      });
    }

    const durationMs = performance.now() - startedAt;
    if (outcome.kind === 'spawn-error') {
      writeLine(
        `[${stage}] SPAWN ERROR — ${formatDuration(durationMs)} — ${errorMessage(outcome.error)}`,
      );
      return result({
        stage,
        commandLine,
        durationMs,
        exitCode: 1,
        error: errorMessage(outcome.error),
      });
    }

    const exitCode = outcome.code ?? (outcome.signal === null ? 1 : signalExitCode(outcome.signal));
    const status = exitCode === 0 ? 'PASS' : 'FAIL';
    const signal = outcome.signal === null ? '' : ` — signal ${outcome.signal}`;
    writeLine(`[${stage}] ${status} — ${formatDuration(durationMs)} — exit ${exitCode}${signal}`);
    return result({
      stage,
      commandLine,
      durationMs,
      exitCode,
      signal: outcome.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    if (abortSignal !== undefined && abortListener !== undefined) {
      abortSignal.removeEventListener('abort', abortListener);
    }
  }
}

export async function terminateOwnedProcessTree(child, options = {}) {
  const { shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS } = options;

  if (!isRunning(child) || child.pid === undefined) return;

  if (process.platform === 'win32') {
    const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const taskkillPath = `${windowsRoot}\\System32\\taskkill.exe`;
    let taskkillOutput = '';
    const taskkill = spawn(taskkillPath, ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    taskkill.stdout.on('data', (chunk) => {
      taskkillOutput += chunk.toString();
    });
    taskkill.stderr.on('data', (chunk) => {
      taskkillOutput += chunk.toString();
    });

    const taskkillOutcome = await waitForOutcomeWithDeadline(taskkill, shutdownTimeoutMs);
    if (taskkillOutcome.kind === 'deadline') {
      taskkill.kill();
      child.kill('SIGKILL');
      await waitForChildWithDeadline(child, shutdownTimeoutMs);
      throw new Error(`Timed out terminating owned Windows process tree ${child.pid}.`);
    }
    if (taskkillOutcome.kind === 'spawn-error') {
      child.kill('SIGKILL');
      await waitForChildWithDeadline(child, shutdownTimeoutMs);
      throw new Error(
        `Failed to start taskkill for owned Windows process tree ${child.pid}: ${errorMessage(taskkillOutcome.error)}`,
      );
    }
    if (taskkillOutcome.code !== 0) {
      child.kill('SIGKILL');
      await waitForChildWithDeadline(child, shutdownTimeoutMs);
      const diagnostic = taskkillOutput.trim() || `exit ${taskkillOutcome.code}`;
      throw new Error(`Failed to terminate owned Windows process tree ${child.pid}: ${diagnostic}`);
    }
    if (!(await waitForChildWithDeadline(child, shutdownTimeoutMs))) {
      throw new Error(`Owned Windows process ${child.pid} remained alive after taskkill.`);
    }
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (errorCode(error) !== 'ESRCH') throw error;
  }

  if (await waitForChildWithDeadline(child, shutdownTimeoutMs)) return;

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (errorCode(error) !== 'ESRCH') throw error;
  }
  await waitForChildWithDeadline(child, shutdownTimeoutMs);
}

async function cleanupOwnedProcessTree(child, shutdownTimeoutMs, terminateProcessTree) {
  try {
    await terminateProcessTree(child, { shutdownTimeoutMs });
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function waitForChildOutcome(child) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      resolve(outcome);
    };
    const onError = (error) => settle({ kind: 'spawn-error', error });
    const onExit = (code, signal) => settle({ kind: 'exit', code, signal });

    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function waitForChildWithDeadline(child, timeoutMs) {
  if (!isRunning(child)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      child.removeListener('error', onDone);
      child.removeListener('exit', onDone);
      resolve(exited);
    };
    const onDone = () => finish(true);
    const timeoutId = setTimeout(() => finish(false), timeoutMs);

    child.once('error', onDone);
    child.once('exit', onDone);
  });
}

async function waitForOutcomeWithDeadline(child, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      waitForChildOutcome(child),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ kind: 'deadline' }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

function validateInput(input) {
  if (typeof input.stage !== 'string' || input.stage.trim().length === 0) {
    throw new Error('Process stage must be a non-empty string.');
  }
  if (typeof input.command !== 'string' || input.command.trim().length === 0) {
    throw new Error(`Process command for ${input.stage} must be a non-empty string.`);
  }
  for (const [name, value] of [
    ['timeoutMs', input.timeoutMs],
    ['shutdownTimeoutMs', input.shutdownTimeoutMs],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} for ${input.stage} must be a positive number.`);
    }
  }
}

function formatCommand(command, args) {
  return [command, ...args].map((value) => JSON.stringify(String(value))).join(' ');
}

function formatDuration(durationMs) {
  return `${(durationMs / 1_000).toFixed(2)}s`;
}

function signalExitCode(signal) {
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
}

function result(overrides) {
  return {
    stage: overrides.stage,
    commandLine: overrides.commandLine,
    durationMs: overrides.durationMs,
    exitCode: overrides.exitCode,
    signal: overrides.signal ?? null,
    timedOut: overrides.timedOut ?? false,
    aborted: overrides.aborted ?? false,
    error: overrides.error ?? null,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
}
