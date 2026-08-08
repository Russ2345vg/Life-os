import type {
  RoutineOccurrenceExecutionRepository,
  StartRoutineExecutionResult,
} from '../../application';
import {
  ROUTINE_EXECUTION_STATUS,
  type DayDate,
  type EntityId,
  type RoutineOccurrenceExecution,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryRoutineOccurrenceExecutionRepository implements RoutineOccurrenceExecutionRepository {
  readonly #items = new Map<string, RoutineOccurrenceExecution>();

  public constructor(items: readonly RoutineOccurrenceExecution[] = []) {
    for (const item of items) this.#items.set(key(item.routineBlockId, item.occurrenceDate), item);
  }

  public async findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceExecution | null> {
    return this.#items.get(key(routineBlockId, occurrenceDate)) ?? null;
  }

  public async findRunning(): Promise<RoutineOccurrenceExecution | null> {
    const running = [...this.#items.values()].filter(
      (item) => item.status === ROUTINE_EXECUTION_STATUS.running,
    );
    if (running.length > 1) throw multipleRunningExecutions();
    return running[0] ?? null;
  }

  public async findAll(): Promise<readonly RoutineOccurrenceExecution[]> {
    return [...this.#items.values()];
  }

  public async addIfNoRunning(
    execution: RoutineOccurrenceExecution,
  ): Promise<StartRoutineExecutionResult> {
    const itemKey = key(execution.routineBlockId, execution.occurrenceDate);
    if (this.#items.has(itemKey)) return 'occurrenceExists';
    if ([...this.#items.values()].some((item) => item.status === ROUTINE_EXECUTION_STATUS.running))
      return 'runningExists';
    this.#items.set(itemKey, execution);
    return 'saved';
  }

  public async saveIfVersionMatches(
    execution: RoutineOccurrenceExecution,
    expectedVersion: number,
  ): Promise<boolean> {
    const itemKey = key(execution.routineBlockId, execution.occurrenceDate);
    const current = this.#items.get(itemKey);
    if (current?.version !== expectedVersion) return false;
    this.#items.set(itemKey, execution);
    return true;
  }
}

function multipleRunningExecutions(): DomainError {
  return new DomainError(
    'routine_execution.multiple_running',
    'Обнаружено несколько выполняющихся блоков. Это ошибка целостности; данные не изменены.',
  );
}

function key(routineBlockId: EntityId, occurrenceDate: DayDate): string {
  return `${routineBlockId.toString()}\u0000${occurrenceDate.toString()}`;
}
