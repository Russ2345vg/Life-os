import {
  ROUTINE_EXECUTION_STATUS,
  DayDate,
  resolveRoutineOccurrencesForDate,
  type ActionSession,
  type Day,
  type Decision,
  type LifeAction,
  type RoutineOccurrenceExecution,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';

export interface EveningRoutineSummary {
  readonly plannedCount: number;
  readonly startedCount: number;
  readonly completedCount: number;
  readonly runningExecution: RoutineOccurrenceExecution | null;
}

export interface EveningReviewSnapshot {
  readonly day: Day;
  readonly currentDate: DayDate;
  readonly tomorrowDate: DayDate;
  readonly isRecoveryReview: boolean;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly actionSessions: readonly ActionSession[];
  readonly unfinishedSession: ActionSession | null;
  readonly tomorrowDecisions: readonly Decision[];
  readonly routineSummary?: EveningRoutineSummary;
}

export class GetEveningReview {
  readonly #dayRepository: DayRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #routineBlockRepository: RoutineBlockRepository | undefined;
  readonly #routineOverrideRepository: RoutineOccurrenceOverrideRepository | undefined;
  readonly #routineExecutionRepository: RoutineOccurrenceExecutionRepository | undefined;

  public constructor(
    dayRepository: DayRepository,
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    currentDateProvider: CurrentDateProvider,
    routineBlockRepository?: RoutineBlockRepository,
    routineOverrideRepository?: RoutineOccurrenceOverrideRepository,
    routineExecutionRepository?: RoutineOccurrenceExecutionRepository,
  ) {
    this.#dayRepository = dayRepository;
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#currentDateProvider = currentDateProvider;
    this.#routineBlockRepository = routineBlockRepository;
    this.#routineOverrideRepository = routineOverrideRepository;
    this.#routineExecutionRepository = routineExecutionRepository;
  }

  public async execute(reviewDate?: DayDate): Promise<EveningReviewSnapshot> {
    const actualCurrentDate = this.#currentDateProvider.getCurrentDate();
    const currentDate = reviewDate ?? actualCurrentDate;

    if (currentDate.isAfter(actualCurrentDate)) {
      throw new DomainError(
        'day.evening_review_future_date',
        'Вечерний контроль нельзя открыть для будущего дня.',
      );
    }

    const isRecoveryReview = currentDate.isBefore(actualCurrentDate);
    const tomorrowDate = isRecoveryReview ? actualCurrentDate : nextDay(currentDate);
    const [day, decisions, lifeActions, unfinishedSession, tomorrowDecisions, routineSummary] =
      await Promise.all([
        this.#dayRepository.findByDate(currentDate),
        this.#decisionRepository.findByDate(currentDate),
        this.#lifeActionRepository.findByDate(currentDate),
        this.#actionSessionRepository.findUnfinished(),
        this.#decisionRepository.findByDate(tomorrowDate),
        this.getRoutineSummary(currentDate),
      ]);

    if (day === null) {
      throw new DomainError('day.not_found', 'Текущий день не найден.');
    }

    const actionSessions = deduplicateSessions(
      (
        await Promise.all(
          lifeActions.map((lifeAction) =>
            this.#actionSessionRepository.findByLifeActionId(lifeAction.id),
          ),
        )
      ).flat(),
    );

    return Object.freeze({
      day,
      currentDate,
      tomorrowDate,
      isRecoveryReview,
      decisions: Object.freeze(decisions.filter((decision) => !decision.isDeleted())),
      lifeActions: Object.freeze([...lifeActions]),
      actionSessions: Object.freeze(actionSessions),
      unfinishedSession,
      tomorrowDecisions: Object.freeze(
        tomorrowDecisions.filter((decision) => !decision.isDeleted()),
      ),
      routineSummary,
    });
  }

  private async getRoutineSummary(date: DayDate): Promise<EveningRoutineSummary> {
    if (
      this.#routineBlockRepository === undefined ||
      this.#routineOverrideRepository === undefined ||
      this.#routineExecutionRepository === undefined
    ) {
      return Object.freeze({
        plannedCount: 0,
        startedCount: 0,
        completedCount: 0,
        runningExecution: null,
      });
    }
    const [blocks, overrides, executions] = await Promise.all([
      this.#routineBlockRepository.findAll(),
      this.#routineOverrideRepository.findAll(),
      this.#routineExecutionRepository.findAll(),
    ]);
    const occurrences = resolveRoutineOccurrencesForDate(blocks, overrides, date).filter(
      (occurrence) => !occurrence.isSkipped,
    );
    const relevant = occurrences.flatMap((occurrence) => {
      const execution = executions.find(
        (candidate) =>
          candidate.routineBlockId.equals(occurrence.sourceBlockId) &&
          candidate.occurrenceDate.equals(occurrence.occurrenceDate),
      );
      return execution === undefined ? [] : [execution];
    });
    return Object.freeze({
      plannedCount: occurrences.length,
      startedCount: relevant.length,
      completedCount: relevant.filter(
        (execution) => execution.status === ROUTINE_EXECUTION_STATUS.completed,
      ).length,
      runningExecution:
        relevant.find((execution) => execution.status === ROUTINE_EXECUTION_STATUS.running) ?? null,
    });
  }
}

function nextDay(date: DayDate): DayDate {
  const [yearText, monthText, dayText] = date.toString().split('-');
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + 1));
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function deduplicateSessions(sessions: readonly ActionSession[]): readonly ActionSession[] {
  const byId = new Map<string, ActionSession>();

  for (const session of sessions) {
    byId.set(session.id.toString(), session);
  }

  return [...byId.values()];
}
