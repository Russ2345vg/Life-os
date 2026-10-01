import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createLifeOsApplication } from './createLifeOsApplication';
import { LifeActionTitle, type LifeAction } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock } from '../../test/helpers/Fakes';
import { PlannerActionCompletion } from '../../presentation/planner-v2/PlannerActionCompletion';
import { createCompletionLibraryTask } from '../../presentation/planner-v2/plannerCompletionRefresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('completion with dependent library commits', () => {
  it('waits for a late materialization read after an earlier settlement and recovers without another completion', async () => {
    const app = await createLifeOsApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
      clock: new FakeClock(new Date('2026-09-30T12:00:00Z')),
    });
    try {
      const action = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Завершить шаг'),
      });
      if (!action.ok) throw action.error;
      await app.planning.recurrence.save({
        title: 'Повторение',
        goalId: null,
        priority: null,
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        maxCompletions: null,
        paused: false,
        pauseUntil: null,
        schedule: { kind: 'daily' },
      });
      const model = app.libraryReads.create('2026-09-30');
      const stop = model.subscribe(() => {});
      await model.whenSettled();
      const completion = vi.spyOn(app.completeLifeAction, 'execute');
      const materialize = deferred<void>();
      const readStarted = deferred<void>();
      const read = deferred<LifeAction[]>();
      let attempts = 0;
      const controller = new PlannerActionCompletion(app.completeLifeAction, [
        {
          key: 'planning',
          async run() {
            if (++attempts === 1) {
              await model.whenSettled();
              throw new Error('First planning read failed');
            }
            await materialize.promise;
            expect(await app.planning.recurrence.materialize('2026-10-01', '2026-10-01')).toBe(1);
          },
        },
        createCompletionLibraryTask(model),
      ]);
      await controller.complete({
        actionId: action.value.id.toString(),
        completionKey: action.value.completionKey,
      });
      expect(controller.getSnapshot()).toMatchObject({
        phase: 'saved',
        refresh: 'failed',
        issues: [{ key: 'planning' }],
      });
      vi.spyOn(app.plannerCatalog, 'actions').mockImplementationOnce(() => {
        readStarted.resolve();
        return read.promise;
      });
      const retry = controller.retryRefresh();
      materialize.resolve();
      await readStarted.promise;
      expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', refresh: 'pending' });
      read.reject(new Error('Occurrence read failed'));
      await retry;
      expect(controller.getSnapshot()).toMatchObject({
        phase: 'saved',
        refresh: 'failed',
        issues: [{ key: 'library' }],
      });
      await controller.retryRefresh();
      expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', refresh: 'ready' });
      expect(model.getSnapshot().data?.actions.some((item) => item.occurrence !== null)).toBe(true);
      expect(
        model.getSnapshot().data?.actions.find((item) => item.id.equals(action.value.id))?.status,
      ).toBe('completed');
      expect(completion).toHaveBeenCalledTimes(1);
      expect(attempts).toBe(2);
      stop();
      controller.close();
    } finally {
      app.close();
    }
  });
});
