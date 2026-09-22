import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { terminateOwnedProcessTree } from './test-infrastructure/process-runner.mjs';
import { resolveVitestInvocation } from './run-vitest.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const runnerPath = fileURLToPath(new URL('./run-vitest.mjs', import.meta.url));

describe('one-shot Vitest dispatcher', () => {
  test('refuses an empty targeted invocation before starting Vitest', () => {
    expect(() => resolveVitestInvocation('target', [])).toThrow(
      'test:target requires at least one .test.ts or .test.tsx selector.',
    );
  });

  test('refuses options without a targeted test selector', () => {
    expect(() => resolveVitestInvocation('target', ['--reporter=verbose'])).toThrow(
      'test:target requires at least one .test.ts or .test.tsx selector.',
    );
  });

  test('every public test mode explicitly uses Vitest run', () => {
    for (const [mode, selectors] of [
      ['target', ['src/domain/shared/EntityId.test.ts']],
      ['fast', []],
      ['full', []],
      ['infra', []],
      ['alpha', []],
    ]) {
      expect(resolveVitestInvocation(mode, selectors).args[1]).toBe('run');
    }
  });

  test('rejects an unknown mode instead of falling back to all tests', () => {
    expect(() => resolveVitestInvocation('watch', [])).toThrow('Unknown Vitest mode: watch.');
  });

  test.each([
    '--watch',
    '--watch=true',
    '-w',
    '--ui',
    '--retry',
    '--retry=99',
    '--config',
    '--config=other.ts',
    '-c',
    '-cother.ts',
  ])('rejects an interactive or unmanaged Vitest flag: %s', (argument) => {
    expect(() =>
      resolveVitestInvocation('target', ['src/domain/shared/EntityId.test.ts', argument]),
    ).toThrow(`Unsafe Vitest argument is not allowed: ${argument}.`);
  });

  test('CLI exits immediately for an empty targeted invocation', async () => {
    const result = await runCli(['target']);

    expect(result.code).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.output).toContain(
      'test:target requires at least one .test.ts or .test.tsx selector.',
    );
  });

  test('CLI discovers and runs an explicit .test.tsx selector once', async () => {
    const result = await runCli([
      'target',
      'src/presentation/planner-v2/PlannerForms.test.tsx',
      '--reporter=verbose',
    ]);

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.output).toContain('PlannerForms.test.tsx');
    expect(result.output).toContain('[vitest:target] PASS');
  }, 20_000);
});

function runCli(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...arguments_], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeoutId = setTimeout(async () => {
      try {
        await terminateOwnedProcessTree(child, { shutdownTimeoutMs: 3_000 });
      } catch (error) {
        reject(error);
        return;
      }
      reject(new Error('Vitest dispatcher CLI did not exit within 15 seconds.'));
    }, 15_000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeoutId);
      resolve({ code, signal, output });
    });
  });
}
