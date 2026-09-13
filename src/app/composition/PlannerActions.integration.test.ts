import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ActionExpectedResult, DayDate, EntityId, LifeActionTitle } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';
import { CreateLifeActionDraft } from '../../application';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';

const date = DayDate.create('2026-09-13');
async function setup() {
  const database = new LifeOsIndexedDb(new IDBFactory());
  const app = await createLifeOsApplication({
    database,
    clock: new FakeClock(new Date('2026-09-13T12:00:00+09:00')),
    idGenerator: new FakeIdGenerator('planner'),
  });
  return { app, database };
}

describe('Planner actions', () => {
  it('does not allow the legacy constructor to bypass main-action consistency', async () => {
    const { app, database } = await setup();
    try {
      const command = new CreateLifeActionDraft(
        app.lifeActionRepository,
        app.decisionRepository,
        app.clock,
        app.idGenerator,
      );
      const result = await command.execute({
        title: LifeActionTitle.create('Главное'),
        plannedDate: date,
        isNext: true,
      });
      expect(result.ok).toBe(false);
      expect(await app.lifeActionRepository.findByDate(date)).toHaveLength(0);
    } finally {
      database.close();
    }
  });
  it('rolls back the new action and keeps the previous main when its version changed before commit', async () => {
    const { app, database } = await setup();
    try {
      const original = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Прежнее главное'),
        plannedDate: date,
        isNext: true,
      });
      if (!original.ok) throw original.error;
      const unitOfWork = new IndexedDbJournalUnitOfWork(database);
      const command = new CreateLifeActionDraft(
        app.lifeActionRepository,
        app.decisionRepository,
        app.clock,
        app.idGenerator,
        {
          goalRepository: app.goalRepository,
          unitOfWork: {
            async commit(input) {
              const concurrent = await app.lifeActionRepository.findById(original.value.id);
              if (concurrent === null) throw new Error('Missing original action');
              concurrent.setPlan(date, false);
              concurrent.setPlan(date, true);
              await app.lifeActionRepository.save(concurrent);
              await unitOfWork.commit(input);
            },
          },
        },
      );
      const result = await command.execute({
        title: LifeActionTitle.create('Новое главное'),
        plannedDate: date,
        isNext: true,
      });
      expect(result.ok).toBe(false);
      const saved = await app.lifeActionRepository.findByDate(date);
      expect(saved).toHaveLength(1);
      expect(saved[0]?.id.toString()).toBe(original.value.id.toString());
      expect(saved[0]?.isNext).toBe(true);
    } finally {
      database.close();
    }
  });
  it('keeps only one main when concurrent creations observe an empty day', async () => {
    const { app, database } = await setup();
    try {
      await Promise.all(
        ['Первое', 'Второе'].map((title) =>
          app.createLifeActionDraft.execute({
            title: LifeActionTitle.create(title),
            plannedDate: date,
            isNext: true,
          }),
        ),
      );
      const actions = await app.lifeActionRepository.findByDate(date);
      expect(actions.filter((action) => action.isNext)).toHaveLength(1);
    } finally {
      database.close();
    }
  });
  it('keeps the date of an in-progress legacy action but allows changing its main priority', async () => {
    const { app, database } = await setup();
    try {
      const result = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Работа'),
      });
      if (!result.ok) throw result.error;
      const action = result.value;
      action.makeReady({
        plannedDate: date,
        expectedResult: ActionExpectedResult.create('Готово'),
        occurredAt: new Date('2026-09-13T04:00:00Z'),
        eventId: EntityId.create('ready-event'),
      });
      action.markInProgress(new Date('2026-09-13T05:00:00Z'), EntityId.create('start-event'));
      await app.lifeActionRepository.save(action);
      const moved = await app.setLifeActionPlan.execute({
        lifeActionId: action.id,
        plannedDate: DayDate.create('2026-09-14'),
      });
      expect(moved.ok).toBe(false);
      const saved = await app.lifeActionRepository.findById(action.id);
      expect(saved?.plannedDate?.toString()).toBe(date.toString());
      expect(saved?.version).toBe(action.version);
      expect(await app.journalRepository.findByEffectiveDateRange(date, date)).toHaveLength(0);
      const priority = await app.setLifeActionPlan.execute({
        lifeActionId: action.id,
        plannedDate: date,
        isNext: true,
      });
      expect(priority.ok).toBe(true);
    } finally {
      database.close();
    }
  });
  it('reads Today without sessions and groups completion by its actual day', async () => {
    const { app, database } = await setup();
    try {
      const done = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Сделано'),
        plannedDate: DayDate.create('2026-09-12'),
      });
      const today = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Сегодня'),
        plannedDate: date,
      });
      const loose = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Когда-нибудь'),
      });
      if (!done.ok || !today.ok || !loose.ok) throw new Error('Creation failed');
      await app.completeLifeAction.execute({ lifeActionId: done.value.id });
      expect(app.getPlannerToday).toBeDefined();
      const overview = await app.getPlannerToday.execute(date);
      expect(overview.main).toBeNull();
      expect(overview.actions.map((action) => action.id.toString())).toEqual([
        today.value.id.toString(),
      ]);
      expect(overview.completed.map((action) => action.id.toString())).toEqual([
        done.value.id.toString(),
      ]);
      expect(overview.unscheduled.map((action) => action.id.toString())).toEqual([
        loose.value.id.toString(),
      ]);
    } finally {
      database.close();
    }
  });
  it('creates and restores a dated draft linked directly to a Goal, then completes without preparation', async () => {
    const { app, database } = await setup();
    try {
      const goal = await app.createGoal.execute({ title: 'Здоровье' });
      if (!goal.ok) throw goal.error;
      const created = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Прогуляться'),
        goalId: goal.value.id,
        plannedDate: date,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) throw created.error;
      database.close();
      const action = await app.lifeActionRepository.findById(created.value.id);
      expect(action?.plannedDate?.toString()).toBe('2026-09-13');
      expect(action?.goalId?.toString()).toBe(goal.value.id.toString());
      expect(action?.status).toBe('draft');
      expect(action?.expectedResult).toBeNull();
      await expect(
        app.completeLifeAction.execute({ lifeActionId: created.value.id }),
      ).resolves.toMatchObject({ ok: true, value: { status: 'completed', actualResult: null } });
      expect(await app.journalRepository.findByEffectiveDateRange(date, date)).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('rejects an unknown Goal before creating any action', async () => {
    const { app, database } = await setup();
    try {
      const result = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Действие'),
        goalId: EntityId.create('missing'),
      });
      expect(result).toMatchObject({ ok: false, error: { code: 'goal.not_found' } });
      await expect(app.lifeActionRepository.findAll?.()).resolves.toEqual([]);
    } finally {
      database.close();
    }
  });

  it('schedules and clears a standalone date on the same draft and chooses only one main action for the day', async () => {
    const { app, database } = await setup();
    try {
      const first = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Первое'),
        plannedDate: date,
        isNext: true,
      });
      const second = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Второе'),
      });
      if (!first.ok) throw first.error;
      if (!second.ok) throw second.error;
      expect(app.setLifeActionPlan).toBeDefined();
      const planned = await app.setLifeActionPlan.execute({
        lifeActionId: second.value.id,
        plannedDate: date,
        isNext: true,
      });
      expect(planned).toMatchObject({
        ok: true,
        value: { id: second.value.id, status: 'draft', isNext: true },
      });
      await expect(app.lifeActionRepository.findById(first.value.id)).resolves.toMatchObject({
        isNext: false,
      });
      const repeated = await app.setLifeActionPlan.execute({
        lifeActionId: second.value.id,
        plannedDate: date,
        isNext: true,
      });
      if (!planned.ok) throw planned.error;
      expect(repeated).toMatchObject({ ok: true, value: { version: planned.value.version } });
      await expect(
        app.setLifeActionPlan.execute({
          lifeActionId: second.value.id,
          plannedDate: null,
          isNext: false,
        }),
      ).resolves.toMatchObject({ ok: true, value: { plannedDate: null, isNext: false } });
      expect(await app.lifeActionRepository.findAll?.()).toHaveLength(2);
      expect(await app.journalRepository.findByEffectiveDateRange(date, date)).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it('atomically moves main priority on creation while keeping another date independent', async () => {
    const { app, database } = await setup();
    try {
      const first = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Первое'),
        plannedDate: date,
        isNext: true,
      });
      const other = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Завтра'),
        plannedDate: DayDate.create('2026-09-14'),
        isNext: true,
      });
      const next = await app.createLifeActionDraft.execute({
        title: LifeActionTitle.create('Главное'),
        plannedDate: date,
        isNext: true,
      });
      if (!first.ok || !other.ok || !next.ok) throw new Error('Creation failed');
      await expect(app.lifeActionRepository.findById(first.value.id)).resolves.toMatchObject({
        isNext: false,
      });
      await expect(app.lifeActionRepository.findById(other.value.id)).resolves.toMatchObject({
        isNext: true,
      });
      await expect(app.lifeActionRepository.findById(next.value.id)).resolves.toMatchObject({
        isNext: true,
      });
    } finally {
      database.close();
    }
  });
});
