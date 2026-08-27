import { readFileSync, rmSync } from 'node:fs';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, test } from 'vitest';

import ProgressReporter from './progress-reporter.mjs';

const progressFilePath = fileURLToPath(
  new URL(`../../node_modules/.tmp/progress-reporter-${process.pid}.json`, import.meta.url),
);

describe('Playwright progress reporter', () => {
  test('prints START, heartbeat and the current test when it times out', async () => {
    const lines = [];
    const reporter = new ProgressReporter({
      heartbeatMs: 10,
      progressFilePath,
      writeLine: (line) => lines.push(line),
    });
    const testCase = fakeTestCase();

    try {
      reporter.onBegin({}, { allTests: () => [testCase] });
      reporter.onTestBegin(testCase, {});
      await delay(30);
      reporter.onTestEnd(testCase, { status: 'timedOut', duration: 30_000 });
      await reporter.onEnd({ status: 'failed' });

      const output = lines.join('\n');
      expect(output).toContain('[e2e:progress] START 1/1 [mobile-chrome]');
      expect(output).toContain('[e2e:heartbeat] RUNNING 1/1 [mobile-chrome]');
      expect(output).toContain('[e2e:timeout] TEST TIMEOUT 1/1 [mobile-chrome]');
      expect(JSON.parse(readFileSync(progressFilePath, 'utf8'))).toMatchObject({ current: null });
    } finally {
      rmSync(progressFilePath, { force: true });
    }
  });
});

function fakeTestCase() {
  return {
    id: 'walk10-mobile',
    titlePath: () => [
      'walk10.capture.spec.ts',
      'WALK-10 capture keeps timer running, survives reload and supports Inbox edit/process/history',
    ],
    parent: { project: () => ({ name: 'mobile-chrome' }) },
  };
}
