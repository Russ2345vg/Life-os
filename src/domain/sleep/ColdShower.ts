import { DayDate } from '../day/DayDate';
import { addDays } from '../planner/PlanningPeriod';

export type ColdShowerStatus = 'completed' | 'skipped';
export type ColdShowerFeeling = 'better' | 'unchanged' | 'worse';
export type ColdShowerSkipReason = 'forgot' | 'time' | 'unwell' | 'other';

export interface ColdShowerEntry {
  readonly date: string;
  readonly status: ColdShowerStatus;
  readonly energy: number | null;
  readonly feeling: ColdShowerFeeling | null;
  readonly skipReason: ColdShowerSkipReason | null;
  readonly recordedAt: Date;
  readonly updatedAt: Date;
}

export interface ColdShowerInput {
  readonly date: string;
  readonly status: ColdShowerStatus;
  readonly energy?: number | null;
  readonly feeling?: ColdShowerFeeling | null;
  readonly skipReason?: ColdShowerSkipReason | null;
}

export function validateColdShowerEntry(entry: ColdShowerEntry): void {
  DayDate.create(entry.date);
  if (entry.status !== 'completed' && entry.status !== 'skipped')
    throw new TypeError('Выберите выполнение или пропуск душа.');
  if (
    entry.energy !== null &&
    (!Number.isInteger(entry.energy) || entry.energy < 1 || entry.energy > 5)
  )
    throw new TypeError('Бодрость должна быть целым числом от 1 до 5.');
  if (entry.feeling !== null && !['better', 'unchanged', 'worse'].includes(entry.feeling))
    throw new TypeError('Выберите ощущение после душа.');
  if (
    entry.skipReason !== null &&
    !['forgot', 'time', 'unwell', 'other'].includes(entry.skipReason)
  )
    throw new TypeError('Выберите причину пропуска.');
  if (entry.status === 'skipped' && (entry.energy !== null || entry.feeling !== null))
    throw new TypeError('Самочувствие после душа доступно для выполненного дня.');
  if (entry.status === 'completed' && entry.skipReason !== null)
    throw new TypeError('Причина пропуска доступна только для пропущенного дня.');
  if (
    !Number.isFinite(entry.recordedAt.getTime()) ||
    !Number.isFinite(entry.updatedAt.getTime()) ||
    entry.updatedAt < entry.recordedAt
  )
    throw new TypeError('Некорректное время отметки душа.');
}

export function recordColdShower(
  entries: readonly ColdShowerEntry[],
  input: ColdShowerInput,
  now: Date,
): readonly ColdShowerEntry[] {
  const previous = entries.find((entry) => entry.date === input.date);
  const sameStatus = previous?.status === input.status;
  const entry: ColdShowerEntry = {
    date: input.date,
    status: input.status,
    energy: input.energy === undefined ? (sameStatus ? previous.energy : null) : input.energy,
    feeling: input.feeling === undefined ? (sameStatus ? previous.feeling : null) : input.feeling,
    skipReason:
      input.skipReason === undefined ? (sameStatus ? previous.skipReason : null) : input.skipReason,
    recordedAt: previous?.recordedAt ?? new Date(now),
    updatedAt: new Date(now),
  };
  validateColdShowerEntry(entry);
  if (
    previous &&
    previous.status === entry.status &&
    previous.energy === entry.energy &&
    previous.feeling === entry.feeling &&
    previous.skipReason === entry.skipReason
  )
    return entries;
  return [...entries.filter((item) => item.date !== entry.date), entry].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

export function summarizeColdShowers(
  entries: readonly ColdShowerEntry[],
  today: string,
  month: string,
) {
  DayDate.create(today);
  DayDate.create(`${month}-01`);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
  const completed = entries.filter((entry) => entry.status === 'completed' && entry.date <= today);
  const monthly = completed.filter((entry) => entry.date.startsWith(`${month}-`));
  const rated = monthly.filter((entry) => entry.energy !== null);
  return {
    weeklyCompleted: completed.filter((entry) => entry.date >= monday).length,
    monthlyCompleted: monthly.length,
    totalCompleted: completed.length,
    averageEnergy: rated.length
      ? rated.reduce((sum, entry) => sum + entry.energy!, 0) / rated.length
      : null,
    ratedCount: rated.length,
  };
}
