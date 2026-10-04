import process from 'node:process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { resolveCheckInvocations } from './run-check.mjs';

describe('bounded static-check dispatcher', () => {
  test.each([
    ['typecheck', 1],
    ['lint', 1],
    ['format-check', 1],
    ['build', 2],
  ])('defines finite direct commands for %s', (mode, stageCount) => {
    const invocations = resolveCheckInvocations(mode);

    expect(invocations).toHaveLength(stageCount);
    for (const invocation of invocations) {
      expect(invocation.command).toBe(process.execPath);
      expect(invocation.args[0]).toMatch(/node_modules/u);
      expect(invocation.timeoutMs).toBeGreaterThan(0);
      expect(invocation.shutdownTimeoutMs).toBeGreaterThan(0);
    }
  });

  test('uses typecheck before Vite in the bounded build', () => {
    const invocations = resolveCheckInvocations('build');

    expect(invocations.map((invocation) => invocation.stage)).toEqual([
      'check:build:typecheck',
      'check:build:vite',
    ]);
    expect(invocations[0].args.join(' ')).toContain('tsc');
    expect(invocations[1].args.join(' ')).toContain('vite');
  });

  test('verify typechecks once before its bounded Vite build', () => {
    const scripts = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).scripts;
    const verifyStages = scripts.verify.split(' && ');

    expect(verifyStages[0]).toBe('npm run typecheck');
    expect(verifyStages).toContain('npm run build:vite');
    expect(verifyStages).not.toContain('npm run build');
    expect(scripts['build:vite']).toBe('node scripts/run-check.mjs build-vite');
    expect(resolveCheckInvocations('build-vite').map((invocation) => invocation.stage)).toEqual([
      'check:build:vite',
    ]);
  });

  test('checks formatting with a content cache', () => {
    const [invocation] = resolveCheckInvocations('format-check');

    expect(invocation.args).toEqual(
      expect.arrayContaining(['--check', '.', '--cache', '--cache-strategy', 'content']),
    );
  });

  test('rejects an unknown mode before spawning a process', () => {
    expect(() => resolveCheckInvocations('watch')).toThrow('Unknown bounded check mode: watch.');
  });
});
