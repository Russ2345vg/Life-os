import {
  ROUTINE_EXECUTION_STATUS,
  DayDate,
  resolveRoutineOccurrencesForDate,
  type ActionSession,
  type Day,
  type Decision,
  type EveningCycle,
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
import type { EveningCycleApplicationService } from '../evening-cycle';
import type { EnsureCurrentDay } from '../commands/EnsureCurrentDay';
import { GetOpenLoopsForDay, type OpenLoopsForDaySnapshot } from './GetOpenLoopsForDay';

export interface EveningRoutineSummary {
  readonly plannedCount: number;
  readonly startedCount: number;
  readonly completedCount: number;
  readonly runningExecution: RoutineOccurrenceExecution | null;
}

export interface EveningReviewSnapshot {
  readonly cycle: EveningCycle;
  readonly day: Day;
  readonly currentDate: DayDate;
  readonly tomorrowDate: DayDate;
  readonly isRecoveryReview: boolean;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly actionSessions: readonly ActionSession[];
  readonly unfinishedSession: ActionSession | null;
  readonly tomorrowDecisions: readonly Decision[];
  readonly openLoops?: OpenLoopsForDaySnapshot;
  readonly routineSummary?: EveningRoutineSummary;
}

export class GetEveningCycleReview {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #routineBlockRepository: RoutineBlockRepository | undefined;
  readonly #routineOverrideRepository: RoutineOccurrenceOverrideRepository | undefined;
  readonly #routineExecutionRepository: RoutineOccurrenceExecutionRepository | undefined;
  readonly #getOpenLoops: GetOpenLoopsForDay;
  readonly #eveningCycles: EveningCycleApplicationService;
  readonly #ensureDay: Pick<EnsureCurrentDay, 'execute'>;

  public constructor(
    dayRepository: DayRepository,
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    currentDateProvider: CurrentDateProvider,
    routineBlockRepository?: RoutineBlockRepository,
    routineOverrideRepository?: RoutineOccurrenceOverrideRepository,
    routineExecutionRepository?: RoutineOccurrenceExecutionRepository,
    eveningCycles?: EveningCycleApplicationService,
    ensureDay?: Pick<EnsureCurrentDay, 'execute'>,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#currentDateProvider = currentDateProvider;
    this.#routineBlockRepository = routineBlockRepository;
    this.#routineOverrideRepository = routineOverrideRepository;
    this.#routineExecutionRepository = routineExecutionRepository;
    if (eveningCycles === undefined) {
      throw new DomainError(
        'evening_cycle.application_service_required',
        'GetEveningReview должен использовать единое ядро EveningCycle.',
      );
    }
    if (ensureDay === undefined) {
      throw new DomainError(
        'day.ensure_service_required',
        'GetEveningReview должен получать Day через application-команду.',
      );
    }
    this.#eveningCycles = eveningCycles;
    this.#ensureDay = ensureDay;
    this.#getOpenLoops = new GetOpenLoopsForDay(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      eveningCycles,
    );
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
    const day = await this.#ensureDay.execute(currentDate);
    const storedCycle = await this.#eveningCycles.get(currentDate);
    const cycle = storedCycle ?? this.#eveningCycles.preview(day);
    const openLoops =
      storedCycle === null
        ? await this.#getOpenLoops.preview(currentDate, cycle)
        : await this.#getOpenLoops.execute(currentDate);
    const [
      decisions,
      dayLifeActions,
      unfinishedSession,
      dateTomorrowDecisions,
      routineSummary,
      allSessions,
    ] = await Promise.all([
      this.#decisionRepository.findByDate(currentDate),
      this.#lifeActionRepository.findByDate(currentDate),
      this.#actionSessionRepository.findUnfinished(),
      this.#decisionRepository.findByDate(tomorrowDate),
      this.getRoutineSummary(currentDate),
      this.#actionSessionRepository.findAll?.(),
    ]);

    const activeCycle = openLoops.cycle;

    const dayLifeActionIds = new Set(dayLifeActions.map((action) => action.id.toString()));
    const referencedLifeActions = await Promise.all(
      activeCycle.lifeActionIds
        .filter((id) => !dayLifeActionIds.has(id.toString()))
        .map((id) => this.#lifeActionRepository.findById(id)),
    );
    const lifeActions = deduplicateLifeActions([
      ...dayLifeActions,
      ...referencedLifeActions.flatMap((action) => (action === null ? [] : [action])),
    ]);
    const tomorrowDecisionIds = new Set(
      dateTomorrowDecisions.map((decision) => decision.id.toString()),
    );
    const referencedDecisions = await Promise.all(
      activeCycle.decisionIds
        .filter((id) => !tomorrowDecisionIds.has(id.toString()))
        .map((id) => this.#decisionRepository.findById(id)),
    );
    const tomorrowDecisions = deduplicateDecisions([
      ...dateTomorrowDecisions,
      ...referencedDecisions.flatMap((decision) => (decision === null ? [] : [decision])),
    ]);

    const actionIds = new Set(lifeActions.map((lifeAction) => lifeAction.id.toString()));
    const actionSessions = deduplicateSessions(
      allSessions === undefined
        ? (
            await Promise.all(
              lifeActions.map((lifeAction) =>
                this.#actionSessionRepository.findByLifeActionId(lifeAction.id),
              ),
            )
          ).flat()
        : allSessions.filter((session) => actionIds.has(session.lifeActionId.toString())),
    );

    return Object.freeze({
      cycle: activeCycle,
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
      openLoops,
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

export class GetEveningReview {
  readonly #core: Pick<GetEveningCycleReview, 'execute'>;

  public constructor(core: Pick<GetEveningCycleReview, 'execute'>) {
    this.#core = core;
  }

  public execute(reviewDate?: DayDate): Promise<EveningReviewSnapshot> {
    return this.#core.execute(reviewDate);
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

function deduplicateLifeActions(actions: readonly LifeAction[]): readonly LifeAction[] {
  const byId = new Map<string, LifeAction>();
  for (const action of actions) byId.set(action.id.toString(), action);
  return [...byId.values()];
}

function deduplicateDecisions(decisions: readonly Decision[]): readonly Decision[] {
  const byId = new Map<string, Decision>();
  for (const decision of decisions) byId.set(decision.id.toString(), decision);
  return [...byId.values()];
}
