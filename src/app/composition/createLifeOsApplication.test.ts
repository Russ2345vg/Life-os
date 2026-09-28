import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const TODAY = DayDate.create('2026-09-22');

describe('createLifeOsApplication', () => {
  it('composes the current planner, balance, sleep and sync runtime only', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const application = await createLifeOsApplication({
      database,
      clock: new FakeClock(new Date('2026-09-22T08:00:00+09:00')),
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
    });

    expect(application.currentDate).toEqual(TODAY);
    expect(application.sync).toBeDefined();
    expect(application.accountSync).toBeDefined();
    await expect(application.accountSync.load()).resolves.toMatchObject({
      state: 'local_anonymous',
      connection: 'local',
    });
    expect(application.balance).toBeDefined();
    expect(application.planning).toBeDefined();
    expect(application.plannerInbox).toBeDefined();
    expect(application.plannerFocus).toBeDefined();
    expect(application.plannerCatalog).toBeDefined();
    expect(application.sleepSchedule).toBeDefined();
    expect(application.createGoal).toBeDefined();
    expect(application.createLifeActionDraft).toBeDefined();
    expect(application.completeLifeAction).toBeDefined();

    for (const removed of [
      'startCurrentDay',
      'morningCycle',
      'eveningCycle',
      'completeEveningCycle',
      'startLifeActionSession',
      'createRoutineBlock',
      'createWalk',
    ]) {
      expect(removed in application).toBe(false);
    }

    application.close();
  });

  it('keeps existing data stores while V2 reads and writes its current entities', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const application = await createLifeOsApplication({ database });
    const opened = await database.open();

    expect([...opened.objectStoreNames]).toEqual(
      expect.arrayContaining([
        'days',
        'decisions',
        'actionSessions',
        'eveningCycles',
        'walks',
        'spheres',
        'directions',
        'goals',
        'lifeActions',
      ]),
    );

    const goal = await application.createGoal.execute({ title: 'Текущая цель' });
    const action = await application.createLifeActionDraft.execute({
      title: LifeActionTitle.create('Текущее действие'),
      ...(goal.ok ? { goalId: goal.value.id } : {}),
    });

    expect(goal.ok).toBe(true);
    expect(action.ok).toBe(true);
    if (!action.ok) throw action.error;
    const started = await application.workSessions.start(action.value.id.toString());
    await application.timeCapacity.setWeekday(0, 360);
    application.close();
    const reopened = await createLifeOsApplication({ database });
    expect(
      (await reopened.workSessions.list()).find((session) => session.id.equals(started.id))?.status,
    ).toBe('running');
    expect((await reopened.timeCapacity.get())[0]).toBe(360);
    await reopened.workSessions.finish(started.id.toString(), started.version);
    expect((await reopened.plannerCatalog.actions())[0]?.status).toBe('draft');
    await expect(reopened.getGoals.execute()).resolves.toHaveLength(1);
    await expect(reopened.plannerCatalog.actions()).resolves.toHaveLength(1);
    reopened.close();
  });
});
