import { DomainError } from '../../shared/errors/DomainError';
import type { EntityId } from '../shared/EntityId';
import { copyDate } from '../shared/dateCopy';
import type { EveningCycleMode } from './EveningCycleMode';
import type { EveningCycleState } from './EveningCycleState';
import type { EveningModeReason, EveningStageSkipReason } from './EveningCycleMode';

export interface EveningSkippedStageRecord {
  readonly stage: EveningCycleState;
  readonly reason: EveningStageSkipReason;
  readonly skippedAt: Date;
}

export interface ShutdownRecordData {
  readonly cycleId: EntityId;
  readonly dayId: EntityId;
  readonly mode: EveningCycleMode;
  readonly modeReason?: EveningModeReason | null;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly skippedStages?: readonly EveningSkippedStageRecord[];
}

export interface ShutdownRecord {
  readonly cycleId: EntityId;
  readonly dayId: EntityId;
  readonly mode: EveningCycleMode;
  readonly modeReason: EveningModeReason | null;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly skippedStages: readonly EveningSkippedStageRecord[];
}

export function createShutdownRecord(data: ShutdownRecordData): ShutdownRecord {
  assertDate(data.startedAt, 'startedAt');
  assertDate(data.completedAt, 'completedAt');
  if (data.completedAt.getTime() < data.startedAt.getTime()) {
    throw new DomainError(
      'shutdown.invalid_interval',
      'Завершение вечернего цикла не может предшествовать его началу.',
    );
  }
  const startedAt = copyDate(data.startedAt);
  const completedAt = copyDate(data.completedAt);
  const skippedStages = Object.freeze(
    (data.skippedStages ?? []).map((item) =>
      Object.freeze({ ...item, skippedAt: copyDate(item.skippedAt) }),
    ),
  );
  return Object.freeze({
    cycleId: data.cycleId,
    dayId: data.dayId,
    mode: data.mode,
    modeReason: data.modeReason ?? null,
    skippedStages,
    get startedAt(): Date {
      return copyDate(startedAt);
    },
    get completedAt(): Date {
      return copyDate(completedAt);
    },
  });
}

function assertDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('shutdown.invalid_time', `Поле ${field} содержит некорректное время.`);
  }
}
