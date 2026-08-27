import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { MorningCycle } from './MorningCycle';
import { MORNING_PHYSICAL_STATUS } from './MorningPhysicalStatus';
import { MORNING_CYCLE_STATE } from './MorningCycleState';
import { MORNING_STAGE_STATUS } from './MorningStageState';

const DATE = DayDate.create('2026-08-23');
const CREATED_AT = new Date('2026-08-23T06:50:00.000+09:00');
const STARTED_AT = new Date('2026-08-23T07:12:00.000+09:00');
const WATER_AT = new Date('2026-08-23T07:14:00.000+09:00');
const LATER = new Date('2026-08-23T07:30:00.000+09:00');
const READY_AT = new Date('2026-08-23T07:40:00.000+09:00');
const FINISHED_AT = new Date('2026-08-23T07:45:00.000+09:00');

describe('MorningCycle', () => {
  it('создаёт неактивный цикл с безопасными значениями нового фундамента', () => {
    const cycle = createCycle();

    expect(cycle.state).toBe(MORNING_CYCLE_STATE.notStarted);
    expect(cycle.finishedAt).toBeNull();
    expect(cycle.shortenedMode).toBe(false);
    expect(cycle.stageStates).toEqual([]);
    expect(cycle.isActive()).toBe(false);
  });

  it('сохраняет первое время старта и воды при повторных командах', () => {
    const cycle = createCycle();

    expect(cycle.start(STARTED_AT)).toBe(true);
    expect(cycle.start(LATER)).toBe(false);
    expect(cycle.completeWater(WATER_AT, 250)).toBe(true);
    expect(cycle.completeWater(LATER, 250)).toBe(false);

    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.waterCompletedAt).toEqual(WATER_AT);
    expect(cycle.waterAmountMl).toBe(250);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.inProgress);
    expect(cycle.isActive()).toBe(true);
    expect(cycle.version).toBe(3);
  });

  it('идемпотентно переводит запущенное утро в готовность и завершение', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.markReadyToWork(READY_AT)).toBe(true);
    expect(cycle.markReadyToWork(LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(cycle.isActive()).toBe(true);

    expect(cycle.finish(FINISHED_AT)).toBe(true);
    expect(cycle.finish(LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.finished);
    expect(cycle.finishedAt).toEqual(FINISHED_AT);
    expect(cycle.isActive()).toBe(false);
    expect(cycle.version).toBe(4);
  });

  it('идемпотентно закрывает активное утро как незавершённое', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.abandon(READY_AT)).toBe(true);
    expect(cycle.abandon(LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.abandoned);
    expect(cycle.finishedAt).toEqual(READY_AT);
    expect(cycle.isActive()).toBe(false);
    expect(cycle.version).toBe(3);
  });

  it('запрещает недопустимые переходы жизненного цикла и изменения terminal-цикла', () => {
    const cycle = createCycle();

    expect(() => cycle.markReadyToWork(READY_AT)).toThrowError(
      'Переход состояния утреннего блока недоступен.',
    );
    cycle.start(STARTED_AT);
    expect(() => cycle.finish(FINISHED_AT)).toThrowError(
      'Переход состояния утреннего блока недоступен.',
    );
    cycle.abandon(FINISHED_AT);
    expect(() => cycle.completeWater(LATER, 250)).toThrowError('Утренний блок уже закрыт.');
  });

  it('восстанавливает stage snapshots и не отдаёт изменяемые ссылки наружу', () => {
    const stageUpdatedAt = new Date('2026-08-23T07:22:00.000+09:00');
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('morning-cycle'),
      dayId: EntityId.create('day'),
      dateKey: DATE,
      state: MORNING_CYCLE_STATE.inProgress,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: false,
      stageStates: [
        {
          stageId: 'wake-up',
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: stageUpdatedAt,
        },
      ],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: READY_AT,
      version: 2,
    });

    const firstRead = cycle.stageStates;
    expect(firstRead).toEqual([
      {
        stageId: 'wake-up',
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: stageUpdatedAt,
      },
    ]);
    firstRead[0]!.updatedAt?.setUTCFullYear(2000);
    expect(cycle.stageStates[0]?.updatedAt).toEqual(stageUpdatedAt);
  });

  it('отклоняет дубликаты и некорректные stage snapshots при восстановлении', () => {
    const base = {
      id: EntityId.create('morning-cycle'),
      dayId: EntityId.create('day'),
      dateKey: DATE,
      state: MORNING_CYCLE_STATE.inProgress,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: false,
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: READY_AT,
      version: 2,
    };

    expect(() =>
      MorningCycle.rehydrate({
        ...base,
        stageStates: [
          { stageId: 'water', status: MORNING_STAGE_STATUS.pending, updatedAt: null },
          { stageId: 'water', status: MORNING_STAGE_STATUS.active, updatedAt: READY_AT },
        ],
      }),
    ).toThrowError('Состояния этапов утреннего блока некорректны.');
  });

  it('не позволяет отметить воду до запуска утра', () => {
    expect(() => createCycle().completeWater(WATER_AT, 250)).toThrowError(
      'Сначала начните утренний блок.',
    );
  });

  it('завершает физическую активацию по допустимой последовательности', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.preparePhysical(WATER_AT)).toBe(true);
    expect(cycle.startPhysical(LATER)).toBe(true);
    expect(cycle.completePhysical(new Date('2026-08-23T07:45:00.000+09:00'))).toBe(true);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.done);
    expect(() => cycle.skipPhysical(new Date('2026-08-23T07:46:00.000+09:00'))).toThrowError(
      'Физическая активация уже завершена.',
    );
  });

  it('фиксирует корректный пропуск один раз', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.skipPhysical(WATER_AT)).toBe(true);
    expect(cycle.skipPhysical(LATER)).toBe(false);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.skipped);
    expect(cycle.physicalUpdatedAt).toEqual(WATER_AT);
  });
});

function createCycle(): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create('morning-cycle'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    occurredAt: CREATED_AT,
  });
}
