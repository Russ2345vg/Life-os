import { spawn } from 'node:child_process';
import console from 'node:console';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { get } from 'node:http';
import { createConnection } from 'node:net';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { runBoundedProcess, terminateOwnedProcessTree } from './process-runner.mjs';

export function validatePlaywrightArguments(arguments_) {
  for (const argument of arguments_) {
    const configOverride =
      argument === '--config' ||
      argument.startsWith('--config=') ||
      argument === '-c' ||
      (argument.startsWith('-c') && !argument.startsWith('--'));
    const interactive =
      argument === '--ui' ||
      argument.startsWith('--ui=') ||
      argument === '--ui-host' ||
      argument.startsWith('--ui-host=') ||
      argument === '--debug' ||
      argument === '--headed' ||
      argument === '--reporter' ||
      argument.startsWith('--reporter=') ||
      argument === '--retries' ||
      argument.startsWith('--retries=');

    if (configOverride || interactive) {
      throw new Error(`Managed E2E lifecycle does not accept argument: ${argument}.`);
    }
  }
}

export async function runManagedE2e(options) {
  const startedAt = performance.now();
  const writeLine = options.writeLine ?? console.log;
  const serverUrl = options.serverUrl ?? `http://${options.host}:${options.port}`;

  try {
    validatePlaywrightArguments(options.playwrightArguments);
  } catch (error) {
    const message = errorMessage(error);
    writeLine(`[e2e:validation] FAIL — ${message}`);
    return lifecycleResult('validation', 1, startedAt, { error: message });
  }

  if (options.abortSignal?.aborted) {
    return lifecycleResult('validation', options.abortExitCode ?? 1, startedAt, { aborted: true });
  }

  if (await isPortOpen(options.host, options.port)) {
    const message = `${serverUrl} is already in use; refusing to stop or reuse its owner.`;
    writeLine(`[e2e:port-check] FAIL — ${message}`);
    return lifecycleResult('port-check', 1, startedAt, { error: message });
  }

  writeLine(`[e2e:port-check] PASS — ${serverUrl} is available`);

  let serverProcess;
  let lifecycleOutcome;
  let serverSpawnError = null;

  try {
    try {
      serverProcess = spawn(options.serverCommand.command, options.serverCommand.args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: process.platform !== 'win32',
      });
      serverProcess.once('error', (error) => {
        serverSpawnError = error;
      });
    } catch (error) {
      serverSpawnError = error;
    }

    const startup = await waitForServerStartup({
      serverProcess,
      getServerSpawnError: () => serverSpawnError,
      serverUrl,
      timeoutMs: options.startupTimeoutMs,
      abortSignal: options.abortSignal,
    });

    if (startup.kind !== 'ready') {
      const exitCode =
        startup.kind === 'timeout'
          ? 124
          : startup.kind === 'abort'
            ? (options.abortExitCode ?? 1)
            : 1;
      writeLine(`[e2e:vite-startup] ${startup.kind.toUpperCase()} — ${startup.message}`);
      lifecycleOutcome = lifecycleResult('vite-startup', exitCode, startedAt, {
        timedOut: startup.kind === 'timeout',
        aborted: startup.kind === 'abort',
        error: startup.kind === 'error' ? startup.message : null,
      });
    } else {
      writeLine(`[e2e:vite-startup] READY — ${serverUrl}`);
      await prepareProgressFile(options.progressFilePath);
      try {
        const playwrightResult = await runBoundedProcess({
          stage: 'e2e:playwright',
          command: options.playwrightCommand.command,
          args: [...options.playwrightCommand.args, ...options.playwrightArguments],
          cwd: options.cwd,
          env: options.env,
          timeoutMs: options.playwrightTimeoutMs,
          shutdownTimeoutMs: options.shutdownTimeoutMs,
          abortSignal: options.abortSignal,
          abortExitCode: options.abortExitCode,
          writeLine,
        });
        if (playwrightResult.timedOut) {
          await reportCurrentTestAtTimeout(options.progressFilePath, writeLine);
        }
        lifecycleOutcome = { ...playwrightResult, stage: 'playwright' };
      } finally {
        await removeProgressFile(options.progressFilePath);
      }
    }
  } finally {
    const cleanupError = await teardownServer({
      serverProcess,
      host: options.host,
      port: options.port,
      shutdownTimeoutMs: options.shutdownTimeoutMs,
      writeLine,
    });
    if (cleanupError !== null) {
      lifecycleOutcome = lifecycleResult('teardown', 1, startedAt, {
        error: cleanupError.message,
      });
    }
  }

  return lifecycleOutcome;
}

async function prepareProgressFile(progressFilePath) {
  if (progressFilePath === undefined) return;
  await mkdir(dirname(progressFilePath), { recursive: true });
  await rm(progressFilePath, { force: true });
}

async function removeProgressFile(progressFilePath) {
  if (progressFilePath === undefined) return;
  await rm(progressFilePath, { force: true });
}

async function reportCurrentTestAtTimeout(progressFilePath, writeLine) {
  const progress = await readProgress(progressFilePath);
  if (progress?.current === undefined || progress.current === null) {
    writeLine('[e2e:timeout] TIMEOUT — stage playwright — current test unavailable');
    return;
  }
  const current = progress.current;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(current.startedAt)) / 1_000),
  );
  writeLine(
    `[e2e:timeout] TIMEOUT — stage playwright — current ${current.index}/${current.total} [${current.project}] ${current.title} — elapsed ${elapsedSeconds}s`,
  );
}

async function readProgress(progressFilePath) {
  if (progressFilePath === undefined) return null;
  try {
    return JSON.parse(await readFile(progressFilePath, 'utf8'));
  } catch {
    return null;
  }
}

async function waitForServerStartup(input) {
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() < deadline) {
    if (input.abortSignal?.aborted) {
      return { kind: 'abort', message: `Interrupted by ${String(input.abortSignal.reason)}.` };
    }
    const spawnError = input.getServerSpawnError();
    if (spawnError !== null) {
      return { kind: 'error', message: `Vite spawn failed: ${errorMessage(spawnError)}` };
    }
    if (
      input.serverProcess !== undefined &&
      (input.serverProcess.exitCode !== null || input.serverProcess.signalCode !== null)
    ) {
      return { kind: 'error', message: 'Vite exited before its HTTP endpoint became ready.' };
    }
    if (await isHttpAvailable(input.serverUrl)) return { kind: 'ready' };
    await delay(50);
  }

  return {
    kind: 'timeout',
    message: `Timed out after ${input.timeoutMs}ms waiting for ${input.serverUrl}.`,
  };
}

async function teardownServer(input) {
  let terminationError = null;
  try {
    if (input.serverProcess !== undefined) {
      try {
        await terminateOwnedProcessTree(input.serverProcess, {
          shutdownTimeoutMs: input.shutdownTimeoutMs,
        });
      } catch (error) {
        terminationError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (!(await waitForPortClosed(input.host, input.port, input.shutdownTimeoutMs))) {
      throw new Error(
        `Owned E2E server did not release ${input.host}:${input.port} within ${input.shutdownTimeoutMs}ms.${terminationError === null ? '' : ` Primary cleanup error: ${terminationError.message}`}`,
      );
    }
    if (terminationError !== null) {
      input.writeLine(
        `[e2e:teardown] RECOVERED — primary tree cleanup reported: ${terminationError.message}; exact owned server root exited and ${input.host}:${input.port} is released`,
      );
    }
    input.writeLine(`[e2e:teardown] PASS — ${input.host}:${input.port} released`);
    return null;
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    input.writeLine(`[e2e:teardown] FAIL — ${normalized.message}`);
    return normalized;
  }
}

async function waitForPortClosed(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(host, port))) return true;
    await delay(50);
  }
  return !(await isPortOpen(host, port));
}

function isHttpAvailable(serverUrl) {
  return new Promise((resolve) => {
    const request = get(serverUrl, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolve(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function lifecycleResult(stage, exitCode, startedAt, overrides = {}) {
  return {
    stage,
    exitCode,
    durationMs: performance.now() - startedAt,
    signal: null,
    timedOut: overrides.timedOut ?? false,
    aborted: overrides.aborted ?? false,
    error: overrides.error ?? null,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
