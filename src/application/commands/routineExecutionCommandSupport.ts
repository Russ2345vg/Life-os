import {
  DAY_STATUS,
  ROUTINE_EXECUTION_STATUS,
  resolveRoutineOccurrencesForDate,
  type DayDate,
  type EffectiveRoutineOccurrence,
  type EntityId,
  type RoutineOccurrenceExecution,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';

export interface RoutineExecutionCommandDependencies {
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly overrideRepository: RoutineOccurrenceOverrideRepository;
  readonly executionRepository: RoutineOccurrenceExecutionRepository;
  readonly dayRepository: DayRepository;
  readonly currentDateProvider: CurrentDateProvider;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export interface RoutineExecutionOccurrenceInput {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly effectiveDate: DayDate;
}

export async function getStartableEffectiveOccurrence(
  dependencies: RoutineExecutionCommandDependencies,
  input: RoutineExecutionOccurrenceInput,
): Promise<EffectiveRoutineOccurrence> {
  await validateFactDate(dependencies, input.effectiveDate);
  const occurrence = await getEffectiveOccurrence(dependencies, input);
  if (occurrence.isSkipped || occurrence.isRescheduledSource) {
    throw new DomainError(
      'routine_execution.plan_not_startable',
      occurrence.isRescheduledSource
        ? 'Перенесённый исходный блок нельзя начать. Откройте его на новой дате.'
        : 'Пропущенный по плану блок нельзя начать.',
    );
  }
  return occurrence;
}

export async function getEffectiveOccurrence(
  dependencies: Pick<
    RoutineExecutionCommandDependencies,
    'routineBlockRepository' | 'overrideRepository'
  >,
  input: RoutineExecutionOccurrenceInput,
): Promise<EffectiveRoutineOccurrence> {
  const [blocks, overrides] = await Promise.all([
    dependencies.routineBlockRepository.findAll(),
    dependencies.overrideRepository.findAll(),
  ]);
  const occurrence = resolveRoutineOccurrencesForDate(blocks, overrides, input.effectiveDate).find(
    (candidate) =>
      candidate.sourceBlockId.equals(input.routineBlockId) &&
      candidate.occurrenceDate.equals(input.occurrenceDate),
  );
  if (occurrence === undefined) {
    throw new DomainError(
      'routine_execution.occurrence_not_found',
      'Появление блока распорядка не найдено.',
    );
  }
  return occurrence;
}

export async function validateFinishFactDate(
  dependencies: RoutineExecutionCommandDependencies,
  input: RoutineExecutionOccurrenceInput,
  execution: RoutineOccurrenceExecution,
): Promise<void> {
  await getEffectiveOccurrence(dependencies, input);
  const currentDate = dependencies.currentDateProvider.getCurrentDate();
  if (
    input.effectiveDate.isBefore(currentDate) &&
    execution.status === ROUTINE_EXECUTION_STATUS.running
  ) {
    return;
  }
  await validateFactDate(dependencies, input.effectiveDate);
}

export async function validateFactDate(
  dependencies: Pick<RoutineExecutionCommandDependencies, 'currentDateProvider' | 'dayRepository'>,
  effectiveDate: DayDate,
): Promise<void> {
  const currentDate = dependencies.currentDateProvider.getCurrentDate();
  if (!effectiveDate.equals(currentDate)) {
    throw new DomainError(
      effectiveDate.isBefore(currentDate)
        ? 'routine_execution.past_date'
        : 'routine_execution.future_date',
      effectiveDate.isBefore(currentDate)
        ? 'Прошлые выполнения доступны только для просмотра.'
        : 'Фактическое выполнение можно начать только сегодня.',
    );
  }
  const day = await dependencies.dayRepository.findByDate(effectiveDate);
  if (day?.status === DAY_STATUS.completed) {
    throw new DomainError(
      'routine_execution.completed_day',
      'Завершённый день доступен только для просмотра.',
    );
  }
  if (day?.status !== DAY_STATUS.open) {
    throw new DomainError('routine_execution.day_not_open', 'Сначала начните день.');
  }
}

export function executionVersionConflict(): DomainError {
  return new DomainError(
    'routine_execution.version_conflict',
    'Выполнение блока уже изменилось. Обновите распорядок и повторите действие.',
  );
}
