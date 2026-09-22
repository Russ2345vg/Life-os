import type { RecurringActions } from '../planner/RecurringActions';
import {
  DAY_STATUS,
  LIFE_ACTION_STATUS,
  ROUTINE_BLOCK_ASSIGNMENT,
  RoutineOccurrenceOverride,
  type DayDate,
  type EntityId,
  type RoutineBlock,
  type RoutineOccurrenceOverrideDetails,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';

export interface RoutineOccurrenceCommandDependencies {
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly overrideRepository: RoutineOccurrenceOverrideRepository;
  readonly dayRepository: DayRepository;
  readonly actionSessionRepository: ActionSessionRepository;
  readonly currentDateProvider: CurrentDateProvider;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly recurrence?: RecurringActions;
  readonly lifeActionRepository?: LifeActionRepository;
  readonly executionRepository?: RoutineOccurrenceExecutionRepository;
}

export interface RoutineOccurrenceCommandInput {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly expectedVersion?: number;
}

export async function validateMutableOccurrence(
  dependencies: RoutineOccurrenceCommandDependencies,
  input: RoutineOccurrenceCommandInput,
): Promise<RoutineBlock> {
  const block = await dependencies.routineBlockRepository.findById(input.routineBlockId);
  if (block === null || !block.occursOn(input.occurrenceDate)) {
    throw new DomainError(
      'routine_occurrence_override.occurrence_not_found',
      'Появление блока распорядка не найдено.',
    );
  }
  const currentDate = dependencies.currentDateProvider.getCurrentDate();
  if (input.occurrenceDate.isBefore(currentDate)) {
    throw new DomainError(
      'routine_occurrence_override.past_date',
      'Нельзя создавать отклонение для прошедшего дня.',
    );
  }
  const day = await dependencies.dayRepository.findByDate(input.occurrenceDate);
  if (day?.status === DAY_STATUS.completed) {
    throw new DomainError(
      'routine_occurrence_override.completed_day',
      'Завершённый день доступен только для просмотра.',
    );
  }
  const execution = await dependencies.executionRepository?.findByOccurrence(
    input.routineBlockId,
    input.occurrenceDate,
  );
  if (execution !== undefined && execution !== null) {
    throw new DomainError(
      'routine_occurrence_override.execution_exists',
      'План этого появления уже стал историческим и больше не редактируется.',
    );
  }
  if (
    block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction ||
    block.assignment.kind === 'existingSeries'
  ) {
    const unfinished = await dependencies.actionSessionRepository.findUnfinished();
    const running =
      unfinished && block.assignment.kind === 'existingSeries'
        ? await dependencies.lifeActionRepository?.findById(unfinished.lifeActionId)
        : null;
    const matches =
      block.assignment.kind === 'existingSeries'
        ? running?.occurrence?.ruleId === block.assignment.ruleId.toString() &&
          running?.plannedDate?.equals(input.occurrenceDate)
        : unfinished?.lifeActionId.equals(block.assignment.actionId);
    if (matches) {
      throw new DomainError(
        'routine_occurrence_override.active_session',
        'Сначала завершите или остановите текущую рабочую сессию корректным существующим способом.',
      );
    }
  }
  return block;
}

export async function saveOverride(
  dependencies: RoutineOccurrenceCommandDependencies,
  input: RoutineOccurrenceCommandInput,
  details: Omit<RoutineOccurrenceOverrideDetails, 'routineBlockId' | 'occurrenceDate'>,
): Promise<Result<RoutineOccurrenceOverride, DomainError>> {
  try {
    await validateMutableOccurrence(dependencies, input);
    const existing = await dependencies.overrideRepository.findByOccurrence(
      input.routineBlockId,
      input.occurrenceDate,
    );
    if (
      (existing === null && input.expectedVersion !== undefined) ||
      (existing !== null && input.expectedVersion !== existing.version)
    ) {
      return failure(versionConflict());
    }
    const override =
      existing === null
        ? RoutineOccurrenceOverride.create({
            id: dependencies.idGenerator.generate(),
            routineBlockId: input.routineBlockId,
            occurrenceDate: input.occurrenceDate,
            ...details,
            now: dependencies.clock.now(),
          })
        : existing.replace(details, dependencies.clock.now());
    const saved = await dependencies.overrideRepository.saveIfVersionMatches(
      override,
      existing?.version ?? null,
    );
    return saved ? success(override) : failure(versionConflict());
  } catch (error: unknown) {
    if (error instanceof DomainError) return failure(error);
    throw error;
  }
}

export async function validateReplacementAction(
  dependencies: RoutineOccurrenceCommandDependencies,
  replacementActionId: EntityId,
): Promise<void> {
  const action = await dependencies.lifeActionRepository?.findById(replacementActionId);
  if (
    action === undefined ||
    action === null ||
    action.isArchived() ||
    action.status === LIFE_ACTION_STATUS.completed ||
    action.status === LIFE_ACTION_STATUS.cancelled
  ) {
    throw new DomainError(
      'routine_occurrence_override.replacement_action_unavailable',
      'Выбранное действие недоступно для замены.',
    );
  }
}

export function assertExpectedVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) throw versionConflict();
}

export function versionConflict(): DomainError {
  return new DomainError(
    'routine_occurrence_override.version_conflict',
    'Отклонение изменилось в другой вкладке. Обновите данные и повторите сохранение.',
  );
}

export function routineOccurrenceFailure(error: unknown): never {
  throw error;
}
