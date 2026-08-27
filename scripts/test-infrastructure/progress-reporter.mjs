import console from 'node:console';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { clearInterval, setInterval } from 'node:timers';

export default class ProgressReporter {
  constructor(options = {}) {
    this.heartbeatMs = options.heartbeatMs ?? 10_000;
    this.progressFilePath = options.progressFilePath ?? process.env.LIFEOS_E2E_PROGRESS_FILE;
    this.writeLine = options.writeLine ?? console.log;
    this.indexById = new Map();
    this.total = 0;
    this.active = new Map();
  }

  onBegin(_config, suite) {
    const tests = suite.allTests();
    this.total = tests.length;
    this.indexById = new Map(tests.map((testCase, index) => [testCase.id, index + 1]));
    this.persist(null);
    this.writeLine(`[e2e:progress] SUITE — ${this.total} tests`);
  }

  onTestBegin(testCase) {
    const current = this.describeTest(testCase);
    this.clearHeartbeat(testCase.id);
    this.persist(current);
    this.writeLine(`[e2e:progress] START ${formatCurrent(current)}`);
    const heartbeat = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - Date.parse(current.startedAt)) / 1_000);
      this.writeLine(
        `[e2e:heartbeat] RUNNING ${formatCurrent(current)} — elapsed ${elapsedSeconds}s`,
      );
    }, this.heartbeatMs);
    heartbeat.unref?.();
    this.active.set(testCase.id, heartbeat);
  }

  onTestEnd(testCase, result) {
    const current = this.describeTest(testCase);
    this.clearHeartbeat(testCase.id);
    const status = result.status === 'timedOut' ? 'TIMEOUT' : result.status.toUpperCase();
    if (result.status === 'timedOut') {
      this.writeLine(`[e2e:timeout] TEST TIMEOUT ${formatCurrent(current)} — stage playwright`);
    }
    this.writeLine(
      `[e2e:progress] ${status} ${formatCurrent(current)} — ${(result.duration / 1_000).toFixed(2)}s`,
    );
    this.persist(null);
  }

  onEnd(result) {
    for (const testId of this.active.keys()) this.clearHeartbeat(testId);
    this.persist(null);
    this.writeLine(`[e2e:progress] SUITE ${result.status.toUpperCase()}`);
  }

  describeTest(testCase) {
    return {
      index: this.indexById.get(testCase.id) ?? 0,
      total: this.total,
      project: testCase.parent.project()?.name ?? 'unknown-project',
      title: testCase.titlePath().filter(Boolean).join(' › '),
      startedAt: new Date().toISOString(),
    };
  }

  clearHeartbeat(testId) {
    const heartbeat = this.active.get(testId);
    if (heartbeat !== undefined) clearInterval(heartbeat);
    this.active.delete(testId);
  }

  persist(current) {
    if (this.progressFilePath === undefined) return;
    mkdirSync(dirname(this.progressFilePath), { recursive: true });
    writeFileSync(this.progressFilePath, JSON.stringify({ current }));
  }
}

function formatCurrent(current) {
  return `${current.index}/${current.total} [${current.project}] ${current.title}`;
}
