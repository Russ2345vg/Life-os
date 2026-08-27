import process from 'node:process';

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

  test('rejects an unknown mode before spawning a process', () => {
    expect(() => resolveCheckInvocations('watch')).toThrow('Unknown bounded check mode: watch.');
  });
});
