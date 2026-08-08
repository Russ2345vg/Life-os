import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, ROUTINE_BLOCK_ASSIGNMENT, createRoutineBlockAssignment } from '..';
import { ROUTINE_BLOCK_CATEGORY } from './RoutineBlockCategory';
import { RoutineBlock } from './RoutineBlock';
import { ROUTINE_BLOCK_RECURRENCE, RoutineBlockRecurrence } from './RoutineBlockRecurrence';

const MONDAY = DayDate.create('2026-08-03');

function createBlock(recurrence = RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none)) {
  return RoutineBlock.create({
    id: EntityId.create('routine-1'),
    anchorDate: MONDAY,
    title: '  Глубокая работа  ',
    startTime: '09:00',
    endTime: '11:00',
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence,
    required: true,
    now: new Date('2026-08-01T00:00:00.000Z'),
  });
}

describe('RoutineBlock', () => {
  it('creates a planned block with normalized title and version 1', () => {
    const block = createBlock();
    expect(block.title).toBe('Глубокая работа');
    expect(block.version).toBe(1);
    expect(block.required).toBe(true);
    expect(block.assignment.kind).toBe(ROUTINE_BLOCK_ASSIGNMENT.reminder);
  });

  it.each([
    ['', 'routine_block.title_required'],
    ['start', 'routine_block.start_time_required'],
    ['end', 'routine_block.end_time_required'],
  ])('rejects invalid required value %s', (field, code) => {
    const input = {
      id: EntityId.create('invalid'),
      anchorDate: MONDAY,
      title: 'Блок',
      startTime: '09:00',
      endTime: '10:00',
      category: ROUTINE_BLOCK_CATEGORY.work,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
      required: false,
      now: new Date(),
    };
    if (field === '') input.title = '   ';
    if (field === 'start') input.startTime = '';
    if (field === 'end') input.endTime = '';
    expect(() => RoutineBlock.create(input)).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    ['09:00', '09:00'],
    ['10:00', '09:59'],
  ])('rejects end time %s–%s that is not later', (startTime, endTime) => {
    expect(() =>
      RoutineBlock.create({
        id: EntityId.create('invalid-range'),
        anchorDate: MONDAY,
        title: 'Блок',
        startTime,
        endTime,
        category: ROUTINE_BLOCK_CATEGORY.work,
        recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
        required: false,
        now: new Date(),
      }),
    ).toThrow(expect.objectContaining({ code: 'routine_block.invalid_time_range' }));
  });

  it('updates details without mutating the original and increments version', () => {
    const original = createBlock();
    const updated = original.update(
      {
        anchorDate: MONDAY,
        title: 'Отдых',
        startTime: '12:00',
        endTime: '13:00',
        category: ROUTINE_BLOCK_CATEGORY.rest,
        recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.daily),
        required: false,
      },
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(original.title).toBe('Глубокая работа');
    expect(updated.title).toBe('Отдых');
    expect(updated.version).toBe(2);
  });

  it('stores only the stable action id for an existing action assignment', () => {
    const actionId = EntityId.create('action-1');
    const block = RoutineBlock.create({
      id: EntityId.create('assigned-block'),
      anchorDate: MONDAY,
      title: 'Действие',
      startTime: '09:00',
      endTime: '10:00',
      category: ROUTINE_BLOCK_CATEGORY.work,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
      required: false,
      assignment: createRoutineBlockAssignment(ROUTINE_BLOCK_ASSIGNMENT.existingAction, actionId),
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(block.assignment).toMatchObject({
      kind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      actionId,
    });
    expect(Object.keys(block.assignment)).toEqual(['kind', 'actionId']);
  });

  it('clears actionId when the assignment changes to reminder', () => {
    const original = createBlock();
    const linked = original.update(
      {
        anchorDate: original.anchorDate,
        title: original.title,
        startTime: original.startTime,
        endTime: original.endTime,
        category: original.category,
        recurrence: original.recurrence,
        required: original.required,
        assignment: createRoutineBlockAssignment(
          ROUTINE_BLOCK_ASSIGNMENT.existingAction,
          EntityId.create('action-to-clear'),
        ),
      },
      new Date('2026-08-02T00:00:00.000Z'),
    );
    const reminder = linked.update(
      {
        anchorDate: linked.anchorDate,
        title: linked.title,
        startTime: linked.startTime,
        endTime: linked.endTime,
        category: linked.category,
        recurrence: linked.recurrence,
        required: linked.required,
        assignment: createRoutineBlockAssignment(ROUTINE_BLOCK_ASSIGNMENT.reminder),
      },
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(reminder.assignment).toEqual({ kind: ROUTINE_BLOCK_ASSIGNMENT.reminder });
    expect('actionId' in reminder.assignment).toBe(false);
  });
});

describe('RoutineBlockRecurrence', () => {
  it('shows a one-time block only on anchorDate', () => {
    const block = createBlock();
    expect(block.occursOn(MONDAY)).toBe(true);
    expect(block.occursOn(DayDate.create('2026-08-04'))).toBe(false);
  });

  it.each([
    [ROUTINE_BLOCK_RECURRENCE.daily, '2026-08-09', true],
    [ROUTINE_BLOCK_RECURRENCE.weekdays, '2026-08-04', true],
    [ROUTINE_BLOCK_RECURRENCE.weekdays, '2026-08-08', false],
    [ROUTINE_BLOCK_RECURRENCE.weekends, '2026-08-08', true],
    [ROUTINE_BLOCK_RECURRENCE.weekends, '2026-08-05', false],
  ] as const)('applies %s on %s', (kind, date, expected) => {
    expect(createBlock(RoutineBlockRecurrence.create(kind)).occursOn(DayDate.create(date))).toBe(
      expected,
    );
  });

  it('supports selected weekdays and never appears before anchorDate', () => {
    const block = createBlock(
      RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.selectedWeekdays, [1, 3]),
    );
    expect(block.occursOn(DayDate.create('2026-08-05'))).toBe(true);
    expect(block.occursOn(DayDate.create('2026-08-06'))).toBe(false);
    expect(block.occursOn(DayDate.create('2026-07-29'))).toBe(false);
  });

  it('requires at least one selected weekday', () => {
    expect(() => RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.selectedWeekdays)).toThrow(
      expect.objectContaining({ code: 'routine_block.weekdays_required' }),
    );
  });
});
