import { Day, type DayDate, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { DayRepository } from '../ports/DayRepository';

export interface UpdateDayResultSphereInput {
  readonly dayId: EntityId;
  readonly date: DayDate;
  readonly expectedVersion: number;
  readonly sphereId: EntityId | null;
}

export class UpdateDayResultSphere {
  public constructor(readonly repository: DayRepository) {}

  public async execute(input: UpdateDayResultSphereInput): Promise<Result<Day, DomainError>> {
    const stored = await this.repository.findByDate(input.date);
    if (stored === null || !stored.id.equals(input.dayId)) {
      return failure(new DomainError('day.not_found', 'День не найден.'));
    }
    if (stored.version !== input.expectedVersion) return failure(versionConflict());

    try {
      const updated = cloneDay(stored);
      updated.changeResultSphere(input.sphereId);
      if (updated.version === stored.version) return success(stored);
      return (await this.repository.saveIfVersionMatches(updated, input.expectedVersion))
        ? success(updated)
        : failure(versionConflict());
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}

function cloneDay(day: Day): Day {
  return Day.rehydrate({
    id: day.id,
    date: day.date,
    status: day.status,
    createdAt: day.createdAt,
    plannedAt: day.plannedAt,
    openedAt: day.openedAt,
    firstActivityAt: day.firstActivityAt,
    completedAt: day.completedAt,
    summary: day.summary,
    sphereId: day.sphereId,
    version: day.version,
  });
}

function versionConflict(): DomainError {
  return new DomainError(
    'day.version_conflict',
    'Результат дня изменился. Обновите данные и повторите попытку.',
  );
}
