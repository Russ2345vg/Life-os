import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineOccurrenceExecution,
} from '../../domain';
import {
  InMemoryRoutineBlockRepository,
  InMemoryRoutineOccurrenceExecutionRepository,
} from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { CreateRoutineBlock } from './CreateRoutineBlock';
import { DeleteRoutineBlock } from './DeleteRoutineBlock';
import { UpdateRoutineBlock } from './UpdateRoutineBlock';
import { GetRoutineBlocksForDate } from '../queries/GetRoutineBlocksForDate';

const MONDAY = DayDate.create('2026-08-03');

function setup() {
  const repository = new InMemoryRoutineBlockRepository();
  const clock = new FakeClock(new Date('2026-08-03T00:00:00.000Z'));
  const executionRepository = new InMemoryRoutineOccurrenceExecutionRepository();
  return {
    repository,
    clock,
    create: new CreateRoutineBlock(repository, clock, new FakeIdGenerator('routine')),
    executionRepository,
    update: new UpdateRoutineBlock(repository, clock, executionRepository),
    remove: new DeleteRoutineBlock(repository, executionRepository),
    query: new GetRoutineBlocksForDate(repository),
  };
}

function details(overrides: Partial<Parameters<CreateRoutineBlock['execute']>[0]> = {}) {
  return {
    anchorDate: MONDAY,
    title: 'Работа',
    startTime: '09:00',
    endTime: '10:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: ROUTINE_BLOCK_RECURRENCE.none,
    required: true,
    ...overrides,
  };
}

describe('routine block commands', () => {
  it('creates a one-time block and returns it for anchorDate', async () => {
    const app = setup();
    const result = await app.create.execute(details());
    expect(result.ok).toBe(true);
    expect(await app.query.execute(MONDAY)).toHaveLength(1);
    expect(await app.query.execute(DayDate.create('2026-08-04'))).toHaveLength(0);
  });

  it.each([
    [{ title: ' ' }, 'routine_block.title_required'],
    [{ startTime: '' }, 'routine_block.start_time_required'],
    [{ endTime: '' }, 'routine_block.end_time_required'],
    [{ startTime: '10:00', endTime: '10:00' }, 'routine_block.invalid_time_range'],
  ])('does not persist invalid input', async (overrides, code) => {
    const app = setup();
    const result = await app.create.execute(details(overrides));
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(await app.repository.findAll()).toHaveLength(0);
  });

  it('requires actionId for existingAction', async () => {
    const app = setup();
    const result = await app.create.execute(
      details({ assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'routine_block.action_required' },
    });
    expect(await app.repository.findAll()).toHaveLength(0);
  });

  it('calculates recurring appearances, respects anchorDate, and sorts by startTime', async () => {
    const app = setup();
    await app.create.execute(
      details({
        title: 'Позже',
        startTime: '10:00',
        endTime: '11:00',
        recurrence: ROUTINE_BLOCK_RECURRENCE.daily,
      }),
    );
    await app.create.execute(
      details({
        title: 'Раньше',
        startTime: '08:00',
        endTime: '09:00',
        recurrence: ROUTINE_BLOCK_RECURRENCE.selectedWeekdays,
        selectedWeekdays: [1, 3],
      }),
    );
    await app.create.execute(
      details({
        title: 'Будни',
        startTime: '12:00',
        endTime: '13:00',
        recurrence: ROUTINE_BLOCK_RECURRENCE.weekdays,
      }),
    );
    await app.create.execute(
      details({
        title: 'Выходные',
        startTime: '14:00',
        endTime: '15:00',
        recurrence: ROUTINE_BLOCK_RECURRENCE.weekends,
      }),
    );

    expect((await app.query.execute(MONDAY)).map((block) => block.title)).toEqual([
      'Раньше',
      'Позже',
      'Будни',
    ]);
    expect(
      (await app.query.execute(DayDate.create('2026-08-08'))).map((block) => block.title),
    ).toEqual(['Позже', 'Выходные']);
    expect(await app.query.execute(DayDate.create('2026-08-02'))).toHaveLength(0);
  });

  it('updates with expectedVersion', async () => {
    const app = setup();
    const created = await app.create.execute(details());
    if (!created.ok) throw created.error;
    const updated = await app.update.execute({
      ...details({ title: 'Новая работа' }),
      id: created.value.id,
      expectedVersion: 1,
    });
    expect(updated).toMatchObject({ ok: true, value: { title: 'Новая работа', version: 2 } });
  });

  it('creates an existingAction assignment and removes actionId after switching to reminder', async () => {
    const app = setup();
    const created = await app.create.execute(
      details({
        assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
        actionId: EntityId.create('linked-action'),
      }),
    );
    if (!created.ok) throw created.error;
    expect(created.value.assignment).toMatchObject({
      kind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      actionId: expect.objectContaining({ value: 'linked-action' }),
    });

    const relinked = await app.update.execute({
      ...details({
        assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
        actionId: EntityId.create('other-action'),
      }),
      id: created.value.id,
      expectedVersion: created.value.version,
    });
    if (!relinked.ok) throw relinked.error;
    expect(relinked.value.assignment.kind).toBe(ROUTINE_BLOCK_ASSIGNMENT.existingAction);
    if (relinked.value.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction) {
      expect(relinked.value.assignment.actionId.toString()).toBe('other-action');
    }

    const updated = await app.update.execute({
      ...details({ assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.reminder }),
      id: created.value.id,
      expectedVersion: relinked.value.version,
    });
    if (!updated.ok) throw updated.error;
    expect(updated.value.assignment).toEqual({ kind: ROUTINE_BLOCK_ASSIGNMENT.reminder });
    expect('actionId' in updated.value.assignment).toBe(false);
  });

  it('reuses one action link for every occurrence instead of cloning actions', async () => {
    const app = setup();
    const actionId = EntityId.create('one-recurring-action');
    await app.create.execute(
      details({
        recurrence: ROUTINE_BLOCK_RECURRENCE.daily,
        assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
        actionId,
      }),
    );

    const mondayBlock = (await app.query.execute(MONDAY))[0];
    const tuesdayBlock = (await app.query.execute(DayDate.create('2026-08-04')))[0];
    expect(mondayBlock?.id.equals(tuesdayBlock!.id)).toBe(true);
    expect(mondayBlock?.assignment.kind).toBe(ROUTINE_BLOCK_ASSIGNMENT.existingAction);
    expect(tuesdayBlock?.assignment.kind).toBe(ROUTINE_BLOCK_ASSIGNMENT.existingAction);
    if (
      mondayBlock?.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction &&
      tuesdayBlock?.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
    ) {
      expect(mondayBlock.assignment.actionId.equals(actionId)).toBe(true);
      expect(tuesdayBlock.assignment.actionId.equals(actionId)).toBe(true);
    }
  });

  it('preserves user data by rejecting a stale update', async () => {
    const app = setup();
    const created = await app.create.execute(details());
    if (!created.ok) throw created.error;
    await app.update.execute({
      ...details({ title: 'Свежая версия' }),
      id: created.value.id,
      expectedVersion: 1,
    });
    const stale = await app.update.execute({
      ...details({ title: 'Устаревшая версия' }),
      id: created.value.id,
      expectedVersion: 1,
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'routine_block.version_conflict' } });
    expect((await app.repository.findById(created.value.id))?.title).toBe('Свежая версия');
  });

  it('deletes only the routine block with matching version', async () => {
    const app = setup();
    const created = await app.create.execute(details());
    if (!created.ok) throw created.error;
    expect(await app.remove.execute({ id: created.value.id, expectedVersion: 1 })).toMatchObject({
      ok: true,
    });
    expect(await app.repository.findAll()).toHaveLength(0);
  });

  it('rejects stale deletion', async () => {
    const app = setup();
    const created = await app.create.execute(details());
    if (!created.ok) throw created.error;
    await app.update.execute({
      ...details({ title: 'Версия 2' }),
      id: created.value.id,
      expectedVersion: 1,
    });
    expect(await app.remove.execute({ id: created.value.id, expectedVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: 'routine_block.version_conflict' },
    });
    expect(await app.repository.findAll()).toHaveLength(1);
  });

  it('keeps the base plan stable after any occurrence has execution history', async () => {
    const app = setup();
    const created = await app.create.execute(details());
    if (!created.ok) throw created.error;
    await app.executionRepository.addIfNoRunning(
      RoutineOccurrenceExecution.start({
        id: EntityId.create('routine-history'),
        routineBlockId: created.value.id,
        occurrenceDate: MONDAY,
        occurredAt: new Date('2026-08-03T09:05:00.000Z'),
      }),
    );
    expect(
      await app.update.execute({
        ...details({ startTime: '09:30', endTime: '10:30' }),
        id: created.value.id,
        expectedVersion: created.value.version,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_block.execution_history_exists' },
    });
    expect(
      await app.remove.execute({ id: created.value.id, expectedVersion: created.value.version }),
    ).toMatchObject({
      ok: false,
      error: { code: 'routine_block.execution_history_exists' },
    });
    expect(await app.repository.findById(created.value.id)).toMatchObject({
      startTime: '09:00',
      endTime: '10:00',
      version: 1,
    });
  });
});
