import { Day, type DayDate, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { DayRepository } from '../ports/DayRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { EnsureCurrentDay } from '../commands/EnsureCurrentDay';

/** Stores the chosen direction on the existing Day aggregate for each date. */
export class DailyDirection {
  public constructor(
    private readonly days: DayRepository,
    private readonly directions: DirectionRepository,
    private readonly ensureDay: Pick<EnsureCurrentDay, 'execute'>,
  ) {}

  public async get(date: DayDate): Promise<Day | null> {
    return this.days.findByDate(date);
  }

  public async set(date: DayDate, directionId: EntityId | null): Promise<Day> {
    if (directionId !== null) {
      const direction = await this.directions.findById(directionId);
      if (!direction || direction.status !== 'active')
        throw new DomainError('day.direction_unavailable', 'Выберите активное направление.');
    }
    await this.ensureDay.execute(date);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.days.findByDate(date);
      if (!current) throw new DomainError('day.not_found', 'День не найден.');
      const next = Day.rehydrate({
        id: current.id,
        date: current.date,
        status: current.status,
        createdAt: current.createdAt,
        plannedAt: current.plannedAt,
        openedAt: current.openedAt,
        firstActivityAt: current.firstActivityAt,
        completedAt: current.completedAt,
        summary: current.summary,
        sphereId: current.sphereId,
        mainDirectionId: current.mainDirectionId,
        version: current.version,
      });
      next.setMainDirection(directionId);
      if (next.version === current.version) return current;
      if (await this.days.saveIfVersionMatches(next, current.version)) return next;
    }
    throw new DomainError(
      'day.version_conflict',
      'День изменился. Обновите его и повторите выбор.',
    );
  }
}
