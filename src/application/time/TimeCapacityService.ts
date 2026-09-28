import { DomainError } from '../../shared/errors/DomainError';

export const TIME_CAPACITY_ID = 'time-capacity';

export interface TimeCapacityRecord {
  readonly schemaVersion: 1;
  readonly id: typeof TIME_CAPACITY_ID;
  readonly weekdays: readonly (number | null)[];
  readonly version: number;
}

export interface TimeCapacityRepository {
  get(): Promise<TimeCapacityRecord | null>;
  save(weekdays: readonly (number | null)[], expectedVersion: number | null): Promise<void>;
}

export function validateTimeCapacityWeekdays(value: unknown): readonly (number | null)[] {
  if (
    !Array.isArray(value) ||
    value.length !== 7 ||
    value.some(
      (minutes) =>
        minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440),
    )
  )
    throw new DomainError(
      'time_capacity.invalid_weekdays',
      'Укажите доступные минуты для семи дней недели.',
    );
  return value as readonly (number | null)[];
}

export function parseTimeCapacityRecord(value: unknown): TimeCapacityRecord {
  if (!value || typeof value !== 'object')
    throw new DomainError(
      'time_capacity.invalid_record',
      'Настройка доступного времени повреждена.',
    );
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.id !== TIME_CAPACITY_ID ||
    !Number.isInteger(record.version) ||
    Number(record.version) < 1
  )
    throw new DomainError(
      'time_capacity.invalid_record',
      'Настройка доступного времени повреждена.',
    );
  return {
    schemaVersion: 1,
    id: TIME_CAPACITY_ID,
    weekdays: [...validateTimeCapacityWeekdays(record.weekdays)],
    version: Number(record.version),
  };
}

export class TimeCapacityService {
  public constructor(readonly repository: TimeCapacityRepository) {}

  public async get(): Promise<readonly (number | null)[]> {
    return (await this.repository.get())?.weekdays ?? [null, null, null, null, null, null, null];
  }

  public async setWeekday(weekday: number, minutes: number | null): Promise<void> {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      throw new DomainError('time_capacity.invalid_weekday', 'Выберите день недели.');
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440))
      throw new DomainError(
        'time_capacity.invalid_minutes',
        'Доступное время должно быть от 1 до 1440 минут.',
      );
    const current = await this.repository.get();
    const weekdays = [...(current?.weekdays ?? [null, null, null, null, null, null, null])];
    if (weekdays[weekday] === minutes) return;
    weekdays[weekday] = minutes;
    await this.repository.save(weekdays, current?.version ?? null);
  }
}
