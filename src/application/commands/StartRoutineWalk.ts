import {
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_EXECUTION_STATUS,
  RoutineOccurrenceExecution,
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_RETURN_ORIGIN,
  Walk,
  resolveRoutineOccurrencesForDate,
  sameWalkRoutineOccurrenceReference,
  type EffectiveRoutineOccurrence,
  type WalkIntent,
  type WalkMode,
  type WalkReflectionTemplate,
  type WalkRoutineContext,
  type WalkRoutineOccurrenceReference,
  type WalkStateSnapshot,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';
import type { RoutineWalkUnitOfWork } from '../ports/RoutineWalkUnitOfWork';
import type { WalkRepository } from '../ports/WalkRepository';
import {
  pickWalkReflectionQuestion,
  type WalkReflectionQuestionPicker,
} from '../walk/WalkReflectionQuestions';
import { walkReflectionTemplateForIntent, walkTypeForIntent } from '../walk/WalkCreationDefaults';
import { validateFactDate } from './routineExecutionCommandSupport';

export interface StartRoutineWalkInput {
  readonly source: WalkRoutineOccurrenceReference;
  readonly intent: WalkIntent;
  readonly reflectionTemplate?: WalkReflectionTemplate;
  readonly beforeState?: WalkStateSnapshot | null;
  readonly mode: WalkMode;
  readonly timerTargetMinutes?: number;
  readonly reflectionQuestion?: string;
}

export interface StartRoutineWalkDependencies {
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly overrideRepository: RoutineOccurrenceOverrideRepository;
  readonly executionRepository: RoutineOccurrenceExecutionRepository;
  readonly walkRepository: WalkRepository;
  readonly dayRepository: DayRepository;
  readonly currentDateProvider: CurrentDateProvider;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: RoutineWalkUnitOfWork;
  readonly questionPicker?: WalkReflectionQuestionPicker;
}

export class StartRoutineWalk {
  readonly #inFlight = new Map<string, Promise<Result<Walk, DomainError>>>();

  public constructor(readonly dependencies: StartRoutineWalkDependencies) {}

  public async execute(input: StartRoutineWalkInput): Promise<Result<Walk, DomainError>> {
    const key = routineOccurrenceKey(input.source);
    const inFlight = this.#inFlight.get(key);
    if (inFlight !== undefined) return inFlight;
    const execution = this.executeOnce(input);
    this.#inFlight.set(key, execution);
    try {
      return await execution;
    } finally {
      if (this.#inFlight.get(key) === execution) this.#inFlight.delete(key);
    }
  }

  private async executeOnce(input: StartRoutineWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      await validateFactDate(this.dependencies, input.source.effectiveDate);
      const [blocks, overrides] = await Promise.all([
        this.dependencies.routineBlockRepository.findAll(),
        this.dependencies.overrideRepository.findAll(),
      ]);
      const occurrences = resolveRoutineOccurrencesForDate(
        blocks,
        overrides,
        input.source.effectiveDate,
      );
      const occurrenceIndex = occurrences.findIndex((candidate) =>
        sameWalkRoutineOccurrenceReference(routineReferenceOfOccurrence(candidate), input.source),
      );
      if (occurrenceIndex < 0) throw sourceChanged();
      const occurrence = occurrences[occurrenceIndex]!;
      if (
        occurrence.isSkipped ||
        occurrence.isRescheduledSource ||
        occurrence.effectiveAssignment.kind !== ROUTINE_BLOCK_ASSIGNMENT.walk
      ) {
        throw sourceNotStartable();
      }

      const active = await this.dependencies.walkRepository.findActive();
      if (active !== null) {
        const activeSource = active.returnContext?.routineContext?.source ?? null;
        if (
          activeSource !== null &&
          sameWalkRoutineOccurrenceReference(activeSource, input.source)
        ) {
          return success(active);
        }
        throw new DomainError('walk.running_exists', 'Сначала завершите текущую прогулку.');
      }

      assertValidTimer(input);
      const existingExecution = await this.dependencies.executionRepository.findByOccurrence(
        input.source.routineBlockId,
        input.source.occurrenceDate,
      );
      if (
        existingExecution !== null &&
        existingExecution.status !== ROUTINE_EXECUTION_STATUS.running
      ) {
        throw sourceNotStartable();
      }
      const runningExecution = await this.dependencies.executionRepository.findRunning();
      if (
        runningExecution !== null &&
        (existingExecution === null || !runningExecution.id.equals(existingExecution.id))
      ) {
        throw new DomainError(
          'routine_walk.another_routine_running',
          'Сначала завершите или прервите текущий блок распорядка.',
        );
      }

      const now = this.dependencies.clock.now();
      const execution =
        existingExecution ??
        RoutineOccurrenceExecution.start({
          id: this.dependencies.idGenerator.generate(),
          routineBlockId: input.source.routineBlockId,
          occurrenceDate: input.source.occurrenceDate,
          occurredAt: now,
        });
      const nextOccurrence =
        occurrences
          .slice(occurrenceIndex + 1)
          .find((candidate) => !candidate.isSkipped && !candidate.isRescheduledSource) ?? null;
      const routineContext: WalkRoutineContext = {
        source: input.source,
        sourceTitle: occurrence.title,
        next: nextOccurrence === null ? null : routineReferenceOfOccurrence(nextOccurrence),
      };
      const linkedEntity = {
        type: WALK_LINKED_ENTITY_TYPE.routine,
        id: input.source.routineBlockId,
      } as const;
      const question = input.reflectionQuestion?.trim() ?? '';
      const walk = Walk.create({
        id: this.dependencies.idGenerator.generate(),
        date: input.source.effectiveDate,
        type: walkTypeForIntent(input.intent),
        intent: input.intent,
        reflectionTemplate: walkReflectionTemplateForIntent(input.intent, input.reflectionTemplate),
        beforeState: input.beforeState ?? null,
        linkedEntity,
        returnContext: {
          origin: WALK_RETURN_ORIGIN.routine,
          entity: linkedEntity,
          nextStep: nextOccurrence?.title ?? null,
          routineContext,
        },
        now,
      }).start({
        mode: input.mode,
        startedAt: now,
        ...(input.mode === WALK_MODE.timer
          ? { timerTargetMinutes: input.timerTargetMinutes ?? Number.NaN }
          : {}),
        reflectionQuestion:
          question.length > 0
            ? question
            : (this.dependencies.questionPicker ?? pickWalkReflectionQuestion)(),
      });
      const stored = await this.dependencies.unitOfWork.start({
        walk,
        execution,
        expectedExecutionVersion: existingExecution?.version ?? null,
        plan: {
          source: input.source,
          expectedRoutineBlockVersion: occurrence.sourceBlock.version,
          expectedOverrideVersion: occurrence.override?.version ?? null,
        },
      });
      return success(stored);
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}

function routineReferenceOfOccurrence(
  occurrence: EffectiveRoutineOccurrence,
): WalkRoutineOccurrenceReference {
  return {
    routineBlockId: occurrence.sourceBlockId,
    occurrenceDate: occurrence.occurrenceDate,
    effectiveDate: occurrence.effectiveDate,
  };
}

function routineOccurrenceKey(reference: WalkRoutineOccurrenceReference): string {
  return `${reference.routineBlockId.toString()}\u0000${reference.occurrenceDate.toString()}\u0000${reference.effectiveDate.toString()}`;
}

function assertValidTimer(input: StartRoutineWalkInput): void {
  if (
    input.mode === WALK_MODE.timer &&
    (!Number.isInteger(input.timerTargetMinutes) ||
      input.timerTargetMinutes === undefined ||
      input.timerTargetMinutes < 1 ||
      input.timerTargetMinutes > 1440)
  ) {
    throw new DomainError(
      'walk.invalid_timer_target',
      'Длительность прогулки должна быть целым числом от 1 до 1440 минут.',
    );
  }
}

function sourceChanged(): DomainError {
  return new DomainError(
    'routine_walk.source_changed',
    'План блока изменился. Обновите распорядок и повторите запуск.',
  );
}

function sourceNotStartable(): DomainError {
  return new DomainError(
    'routine_walk.source_not_startable',
    'Этот блок распорядка больше нельзя начать как прогулку.',
  );
}
