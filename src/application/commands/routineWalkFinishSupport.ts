import {
  ROUTINE_EXECUTION_STATUS,
  WALK_STATUS,
  type RoutineOccurrenceExecution,
  type Walk,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { RoutineWalkUnitOfWork } from '../ports/RoutineWalkUnitOfWork';

export interface RoutineWalkFinishDependencies {
  readonly executionRepository: RoutineOccurrenceExecutionRepository;
  readonly unitOfWork: RoutineWalkUnitOfWork;
}

export async function finishRoutineWalk(input: {
  readonly storedWalk: Walk;
  readonly finishedWalk: Walk;
  readonly terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned;
  readonly dependencies: RoutineWalkFinishDependencies;
  readonly occurredAt: Date;
}): Promise<void> {
  const context = input.storedWalk.returnContext?.routineContext ?? null;
  if (context === null) throw sourceChanged();
  if (
    (input.storedWalk.status === WALK_STATUS.completed ||
      input.storedWalk.status === WALK_STATUS.abandoned) &&
    input.storedWalk.status !== input.terminalStatus
  ) {
    throw terminalConflict();
  }

  const execution = await input.dependencies.executionRepository.findByOccurrence(
    context.source.routineBlockId,
    context.source.occurrenceDate,
  );
  if (
    execution === null ||
    !execution.routineBlockId.equals(context.source.routineBlockId) ||
    !execution.occurrenceDate.equals(context.source.occurrenceDate)
  ) {
    throw sourceChanged();
  }

  const finishedExecution = finishExecution(execution, input.terminalStatus, input.occurredAt);
  await input.dependencies.unitOfWork.finish({
    walk: input.finishedWalk,
    expectedWalkVersion: input.storedWalk.version,
    execution: finishedExecution,
    expectedExecutionVersion: execution.version,
    terminalStatus: input.terminalStatus,
  });
}

function finishExecution(
  execution: RoutineOccurrenceExecution,
  terminalStatus: typeof WALK_STATUS.completed | typeof WALK_STATUS.abandoned,
  occurredAt: Date,
): RoutineOccurrenceExecution {
  const expectedExecutionStatus =
    terminalStatus === WALK_STATUS.completed
      ? ROUTINE_EXECUTION_STATUS.completed
      : ROUTINE_EXECUTION_STATUS.abandoned;
  if (execution.status === expectedExecutionStatus) return execution;
  if (
    execution.status === ROUTINE_EXECUTION_STATUS.completed ||
    execution.status === ROUTINE_EXECUTION_STATUS.abandoned
  ) {
    throw terminalConflict();
  }
  if (execution.status !== ROUTINE_EXECUTION_STATUS.running) throw sourceChanged();
  return terminalStatus === WALK_STATUS.completed
    ? execution.complete(occurredAt)
    : execution.abandon(occurredAt);
}

function sourceChanged(): DomainError {
  return new DomainError(
    'routine_walk.source_changed',
    'Связанное выполнение блока изменилось. Обновите данные и повторите действие.',
  );
}

function terminalConflict(): DomainError {
  return new DomainError(
    'routine_walk.terminal_conflict',
    'Прогулка и блок распорядка уже завершены несовместимыми способами.',
  );
}
