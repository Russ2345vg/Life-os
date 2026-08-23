import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { MorningCycle } from './MorningCycle';
import { MORNING_PHYSICAL_STATUS } from './MorningPhysicalStatus';

const DATE = DayDate.create('2026-08-23');
const CREATED_AT = new Date('2026-08-23T06:50:00.000+09:00');
const STARTED_AT = new Date('2026-08-23T07:12:00.000+09:00');
const WATER_AT = new Date('2026-08-23T07:14:00.000+09:00');
const LATER = new Date('2026-08-23T07:30:00.000+09:00');

describe('MorningCycle', () => {
  it('сохраняет первое время старта и воды при повторных командах', () => {
    const cycle = createCycle();

    expect(cycle.start(STARTED_AT)).toBe(true);
    expect(cycle.start(LATER)).toBe(false);
    expect(cycle.completeWater(WATER_AT, 250)).toBe(true);
    expect(cycle.completeWater(LATER, 250)).toBe(false);

    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.waterCompletedAt).toEqual(WATER_AT);
    expect(cycle.waterAmountMl).toBe(250);
    expect(cycle.version).toBe(3);
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
