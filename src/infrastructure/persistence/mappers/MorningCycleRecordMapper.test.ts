import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MORNING_STAGE_STATUS,
  MorningCycle,
} from '../../../domain';
import { MorningCycleRecordMapper } from './MorningCycleRecordMapper';

const STARTED_AT = new Date('2026-08-23T22:12:00.000Z');
const UPDATED_AT = new Date('2026-08-23T22:20:00.000Z');

describe('MorningCycleRecordMapper', () => {
  it('сохраняет и восстанавливает lifecycle, shortened marker и этапы', () => {
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('cycle'),
      dayId: EntityId.create('day'),
      dateKey: DayDate.create('2026-08-24'),
      state: MORNING_CYCLE_STATE.readyToWork,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: true,
      stageStates: [
        {
          stageId: 'water',
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT,
        },
      ],
      waterCompletedAt: UPDATED_AT,
      waterAmountMl: 250,
      physicalStatus: MORNING_PHYSICAL_STATUS.skipped,
      physicalUpdatedAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      version: 5,
    });

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      schemaVersion: 1,
      state: MORNING_CYCLE_STATE.readyToWork,
      finishedAt: null,
      shortenedMode: true,
      stageStates: [
        {
          stageId: 'water',
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT.toISOString(),
        },
      ],
    });
    expect(restored.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(restored.shortenedMode).toBe(true);
    expect(restored.stageStates[0]?.updatedAt).toEqual(UPDATED_AT);
  });

  it.each([
    ['отсутствующие поля', {}],
    [
      'null в новых nullable-полях',
      { state: null, finishedAt: null, shortenedMode: null, stageStates: null },
    ],
  ])('безопасно читает legacy-запись: %s', (_label, additions) => {
    const restored = MorningCycleRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'legacy-cycle',
      dayId: 'legacy-day',
      dateKey: '2026-08-24',
      startedAt: STARTED_AT.toISOString(),
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: UPDATED_AT.toISOString(),
      version: 2,
      ...additions,
    });

    expect(restored.state).toBe(MORNING_CYCLE_STATE.inProgress);
    expect(restored.finishedAt).toBeNull();
    expect(restored.shortenedMode).toBe(false);
    expect(restored.stageStates).toEqual([]);
  });

  it('восстанавливает legacy-запись без startedAt как NOT_STARTED', () => {
    const restored = MorningCycleRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'legacy-cycle',
      dayId: 'legacy-day',
      dateKey: '2026-08-24',
      startedAt: null,
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: UPDATED_AT.toISOString(),
      version: 1,
    });

    expect(restored.state).toBe(MORNING_CYCLE_STATE.notStarted);
  });

  it('отклоняет неизвестные lifecycle и stage statuses', () => {
    const valid = MorningCycleRecordMapper.toRecord(
      MorningCycle.create({
        id: EntityId.create('cycle'),
        dayId: EntityId.create('day'),
        dateKey: DayDate.create('2026-08-24'),
        occurredAt: UPDATED_AT,
      }),
    );

    expect(() => MorningCycleRecordMapper.fromRecord({ ...valid, state: 'UNKNOWN' })).toThrowError(
      'Поле state содержит неизвестное состояние.',
    );
    expect(() =>
      MorningCycleRecordMapper.fromRecord({
        ...valid,
        stageStates: [{ stageId: 'water', status: 'UNKNOWN', updatedAt: null }],
      }),
    ).toThrowError('Поле stageStates содержит неизвестное состояние этапа.');
  });
});
