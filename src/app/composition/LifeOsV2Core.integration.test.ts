import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  EntityId,
  GOAL_STATUS,
  JOURNAL_ENTRY_TYPE,
  LifeActionTitle,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { createLifeOsApplication } from './createLifeOsApplication';

const NOW = new Date('2026-09-13T12:00:00+09:00');
const DATE = DayDate.create('2026-09-13');

describe('LifeOS V2 core application', () => {
  it.each(['complete', 'link'] as const)(
    'preserves a concurrent completion when a stale %s write conflicts',
    async (operation) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const app = await createLifeOsApplication({ database, clock: new FakeClock(NOW) });
      try {
        const created = await app.createLifeActionDraft.execute({
          title: LifeActionTitle.create('Действие'),
        });
        const goal = await app.createGoal.execute({ title: 'Цель' });
        if (!created.ok) throw created.error;
        if (!goal.ok) throw goal.error;
        const read = app.lifeActionRepository.findById.bind(app.lifeActionRepository);
        vi.spyOn(app.lifeActionRepository, 'findById').mockImplementationOnce(async (id) => {
          const stale = await read(id);
          const concurrent = await app.completeLifeAction.execute({ lifeActionId: id });
          if (!concurrent.ok) throw concurrent.error;
          return stale;
        });
        const result =
          operation === 'complete'
            ? await app.completeLifeAction.execute({ lifeActionId: created.value.id })
            : await app.setLifeActionGoal.execute({
                lifeActionId: created.value.id,
                goalId: goal.value.id,
              });
        expect(result).toMatchObject({
          ok: false,
          error: { code: 'persistence.transaction_failed' },
        });
        await expect(read(created.value.id)).resolves.toMatchObject({
          status: 'completed',
          goalId: null,
          version: 2,
          completedAt: NOW,
        });
        const entries = await app.journalRepository.findByEffectiveDateRange(DATE, DATE);
        expect(
          entries.filter((entry) => entry.type === JOURNAL_ENTRY_TYPE.actionCompleted),
        ).toHaveLength(1);
      } finally {
        vi.restoreAllMocks();
        database.close();
      }
    },
  );

  it.each(['running', 'paused'] as const)(
    'allows closing a legacy %s session after direct completion without a second action completion',
    async (status) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const clock = new FakeClock(NOW);
      const app = await createLifeOsApplication({ database, clock });
      try {
        const action = markLifeActionInProgress(
          createReadyLifeAction('legacy-session-action', DATE),
        );
        await app.lifeActionRepository.save(action);
        const session = ActionSession.start({
          id: EntityId.create('legacy-session'),
          lifeActionId: action.id,
          startedAt: NOW,
          eventId: EntityId.create('session-start'),
        });
        if (status === 'paused')
          session.pause(new Date('2026-09-13T12:05:00+09:00'), EntityId.create('session-pause'));
        await app.actionSessionRepository.save(session);
        clock.setTime(new Date('2026-09-13T12:10:00+09:00'));
        const completed = await app.completeLifeAction.execute({ lifeActionId: action.id });
        expect(completed.ok).toBe(true);
        if (!completed.ok) throw completed.error;
        await expect(app.actionSessionRepository.findById(session.id)).resolves.toMatchObject({
          status,
        });
        clock.setTime(new Date('2026-09-13T12:20:00+09:00'));
        await expect(
          app.completeActionSession.execute({
            sessionId: session.id,
            completionKind: SESSION_COMPLETION_KIND.completed,
          }),
        ).resolves.toMatchObject({ ok: true, value: { status: 'completed' } });
        await expect(app.actionSessionRepository.findUnfinished()).resolves.toBeNull();
        await expect(app.lifeActionRepository.findById(action.id)).resolves.toMatchObject({
          completedAt: completed.value.completedAt,
          version: completed.value.version,
        });
        const entries = await app.journalRepository.findByEffectiveDateRange(DATE, DATE);
        expect(
          entries.filter((entry) => entry.type === JOURNAL_ENTRY_TYPE.actionCompleted),
        ).toHaveLength(1);
        expect(
          entries.filter((entry) => entry.type === JOURNAL_ENTRY_TYPE.workSessionCompleted),
        ).toHaveLength(1);
      } finally {
        database.close();
      }
    },
  );

  it('links and unlinks the same completed standalone Action without replaying completion', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const clock = new FakeClock(NOW);
    const app = await createLifeOsApplication({
      database,
      clock,
      idGenerator: new FakeIdGenerator('v2'),
    });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Прогуляться'),
      });
      if (!created.ok) throw created.error;
      const completed = await app.completeLifeAction.execute({ lifeActionId: created.value.id });
      expect(completed.ok).toBe(true);
      if (!completed.ok) throw completed.error;
      const entries = await app.journalRepository.findByEffectiveDateRange(DATE, DATE);
      expect(
        entries.filter((entry) => entry.type === JOURNAL_ENTRY_TYPE.actionCompleted),
      ).toHaveLength(1);
      const goal = await app.createGoal.execute({ title: 'Здоровье', status: GOAL_STATUS.active });
      if (!goal.ok) throw goal.error;
      clock.setTime(new Date('2026-09-15T12:00:00+09:00'));
      expect(app.setLifeActionGoal).toBeDefined();
      const linked = await app.setLifeActionGoal.execute({
        lifeActionId: created.value.id,
        goalId: goal.value.id,
      });
      expect(linked).toMatchObject({
        ok: true,
        value: {
          id: created.value.id,
          goalId: goal.value.id,
          status: 'completed',
          completedAt: NOW,
          version: completed.value.version + 1,
        },
      });
      if (!linked.ok) throw linked.error;
      const repeated = await app.setLifeActionGoal.execute({
        lifeActionId: created.value.id,
        goalId: goal.value.id,
      });
      expect(repeated).toMatchObject({ ok: true, value: { version: linked.value.version } });
      const unlinked = await app.setLifeActionGoal.execute({
        lifeActionId: created.value.id,
        goalId: null,
      });
      expect(unlinked).toMatchObject({
        ok: true,
        value: { id: created.value.id, goalId: null, status: 'completed', completedAt: NOW },
      });
      const actions = await app.lifeActionRepository.findAll?.();
      expect(actions).toHaveLength(1);
      expect(actions?.[0]?.id).toEqual(created.value.id);
      await expect(
        app.journalRepository.findByEffectiveDateRange(DATE, DayDate.create('2026-09-15')),
      ).resolves.toEqual(entries);
      database.close();
      await expect(app.lifeActionRepository.findById(created.value.id)).resolves.toMatchObject({
        goalId: null,
        completedAt: NOW,
        status: 'completed',
      });
    } finally {
      database.close();
    }
  });

  it('rejects missing references without changing the action', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = await createLifeOsApplication({ database });
    try {
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Действие'),
      });
      if (!created.ok) throw created.error;
      expect(app.setLifeActionGoal).toBeDefined();
      await expect(
        app.setLifeActionGoal.execute({
          lifeActionId: created.value.id,
          goalId: EntityId.create('missing-goal'),
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: 'goal.not_found' } });
      await expect(
        app.setLifeActionGoal.execute({
          lifeActionId: EntityId.create('missing-action'),
          goalId: null,
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: 'action.not_found' } });
      await expect(app.lifeActionRepository.findById(created.value.id)).resolves.toMatchObject({
        goalId: null,
        version: created.value.version,
      });
    } finally {
      database.close();
    }
  });
});
