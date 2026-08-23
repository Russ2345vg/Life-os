import { MorningCycle, type DayDate } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';

type MorningMutation = (cycle: MorningCycle, occurredAt: Date) => void;

export class MorningCycleApplicationService {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly days: DayRepository,
    private readonly currentDate: CurrentDateProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public get(date: DayDate): Promise<MorningCycle | null> {
    return this.cycles.findByDateKey(date);
  }

  public async start(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    const day = await this.days.findByDate(date);
    if (day === null) {
      throw new DomainError('morning_cycle.day_not_found', 'День для утреннего блока не найден.');
    }
    let cycle = await this.cycles.findByDayId(day.id);
    if (cycle === null) {
      cycle = await this.cycles.createIfAbsent(
        MorningCycle.create({
          id: this.ids.generate(),
          dayId: day.id,
          dateKey: day.date,
          occurredAt: this.clock.now(),
        }),
      );
    }
    if (!cycle.dayId.equals(day.id) || !cycle.dateKey.equals(day.date)) {
      throw new DomainError(
        'morning_cycle.identity_conflict',
        'Утренний блок связан с другим жизненным днём.',
      );
    }
    if (cycle.startedAt !== null) return cycle;
    return this.mutate(date, (current, occurredAt) => current.start(occurredAt));
  }

  public completeWater(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.completeWater(occurredAt, 250));
  }

  public skipPhysical(date: DayDate): Promise<MorningCycle> {
    this.assertCurrentDate(date);
    return this.mutate(date, (cycle, occurredAt) => cycle.skipPhysical(occurredAt));
  }

  private assertCurrentDate(date: DayDate): void {
    if (!date.equals(this.currentDate.getCurrentDate())) {
      throw new DomainError(
        'morning_cycle.current_date_required',
        'Изменять утренний блок можно только для текущего дня.',
      );
    }
  }

  private async mutate(date: DayDate, mutation: MorningMutation): Promise<MorningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.cycles.findByDateKey(date);
      if (stored === null) {
        throw new DomainError('morning_cycle.not_found', 'Сначала начните утренний блок.');
      }
      const cycle = cloneMorningCycle(stored);
      const expectedVersion = cycle.version;
      mutation(cycle, this.clock.now());
      if (cycle.version === expectedVersion) return cycle;
      if (await this.cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'morning_cycle.concurrent_change',
      'Утренний блок изменился в другом окне. Повторите операцию.',
    );
  }
}

export function cloneMorningCycle(cycle: MorningCycle): MorningCycle {
  return MorningCycle.rehydrate({
    id: cycle.id,
    dayId: cycle.dayId,
    dateKey: cycle.dateKey,
    startedAt: cycle.startedAt,
    waterCompletedAt: cycle.waterCompletedAt,
    waterAmountMl: cycle.waterAmountMl,
    physicalStatus: cycle.physicalStatus,
    physicalUpdatedAt: cycle.physicalUpdatedAt,
    updatedAt: cycle.updatedAt,
    version: cycle.version,
  });
}
