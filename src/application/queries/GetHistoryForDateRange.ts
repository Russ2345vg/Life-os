import {
  ACTION_SESSION_STATUS,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type ActionSession,
  DayDate,
  type Decision,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

const MAX_RANGE_DAYS = 31;

export interface GetHistoryForDateRangeInput {
  readonly startDate: DayDate;
  readonly endDate: DayDate;
}

export interface HistoryActionSession {
  readonly session: ActionSession;
  readonly lifeAction: LifeAction;
}

export interface HistoryDateRangeResult {
  readonly startDate: DayDate;
  readonly endDate: DayDate;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly actionSessions: readonly HistoryActionSession[];
}

export class GetHistoryForDateRange {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
  }

  public async execute(input: GetHistoryForDateRangeInput): Promise<HistoryDateRangeResult> {
    const dates = enumerateDates(input.startDate, input.endDate);
    const [decisions, lifeActions] = await Promise.all([
      this.loadDecisions(dates),
      this.loadLifeActions(dates),
    ]);
    const sessions = await this.loadSessions(lifeActions);
    const actionsById = new Map(lifeActions.map((action) => [action.id.toString(), action]));

    const finalDecisions = decisions
      .filter((decision) => isFinalDecision(decision))
      .filter((decision) =>
        isDateInRange(decisionFinishedAt(decision), input.startDate, input.endDate),
      )
      .sort((left, right) =>
        compareDatesDescending(decisionFinishedAt(left), decisionFinishedAt(right)),
      );

    const finalLifeActions = lifeActions
      .filter((action) => isFinalLifeAction(action))
      .filter((action) => isDateInRange(actionFinishedAt(action), input.startDate, input.endDate))
      .sort((left, right) =>
        compareDatesDescending(actionFinishedAt(left), actionFinishedAt(right)),
      );

    const finalSessions = sessions
      .filter((session) => session.status === ACTION_SESSION_STATUS.completed)
      .filter((session) => isDateInRange(session.completedAt, input.startDate, input.endDate))
      .map((session) => ({
        session,
        lifeAction: actionsById.get(session.lifeActionId.toString()),
      }))
      .filter((entry): entry is HistoryActionSession => entry.lifeAction !== undefined)
      .sort((left, right) =>
        compareDatesDescending(left.session.completedAt, right.session.completedAt),
      );

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      decisions: finalDecisions,
      lifeActions: finalLifeActions,
      actionSessions: finalSessions,
    };
  }

  private async loadDecisions(dates: readonly DayDate[]): Promise<readonly Decision[]> {
    if (this.#decisionRepository.findAll !== undefined) {
      return this.#decisionRepository.findAll();
    }

    const results = await Promise.all(
      dates.map((date) => this.#decisionRepository.findByDate(date)),
    );
    return deduplicateById(results.flat());
  }

  private async loadLifeActions(dates: readonly DayDate[]): Promise<readonly LifeAction[]> {
    if (this.#lifeActionRepository.findAll !== undefined) {
      return this.#lifeActionRepository.findAll();
    }

    const results = await Promise.all(
      dates.map((date) => this.#lifeActionRepository.findByDate(date)),
    );
    return deduplicateById(results.flat());
  }

  private async loadSessions(
    lifeActions: readonly LifeAction[],
  ): Promise<readonly ActionSession[]> {
    if (this.#actionSessionRepository.findAll !== undefined) {
      return this.#actionSessionRepository.findAll();
    }

    const results = await Promise.all(
      lifeActions.map((action) => this.#actionSessionRepository.findByLifeActionId(action.id)),
    );
    return deduplicateById(results.flat());
  }
}

function isFinalDecision(decision: Decision): boolean {
  return (
    decision.status === DECISION_STATUS.confirmed || decision.status === DECISION_STATUS.cancelled
  );
}

function isFinalLifeAction(action: LifeAction): boolean {
  return (
    action.status === LIFE_ACTION_STATUS.completed || action.status === LIFE_ACTION_STATUS.cancelled
  );
}

function decisionFinishedAt(decision: Decision): Date | null {
  return decision.confirmedAt ?? decision.cancelledAt;
}

function actionFinishedAt(action: LifeAction): Date | null {
  return action.completedAt ?? action.cancelledAt;
}

function isDateInRange(value: Date | null, startDate: DayDate, endDate: DayDate): boolean {
  if (value === null) {
    return false;
  }

  const day = dayDateFromLocalDate(value);
  return !day.isBefore(startDate) && !day.isAfter(endDate);
}

function dayDateFromLocalDate(value: Date): DayDate {
  return DayDate.fromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function compareDatesDescending(left: Date | null, right: Date | null): number {
  return (right?.getTime() ?? 0) - (left?.getTime() ?? 0);
}

function enumerateDates(startDate: DayDate, endDate: DayDate): readonly DayDate[] {
  if (startDate.isAfter(endDate)) {
    throw new DomainError(
      'history.invalid_date_range',
      'Начальная дата истории не может быть позже конечной.',
    );
  }

  const dates: DayDate[] = [];
  let cursor = toUtcDate(startDate);
  const end = toUtcDate(endDate);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(
      DayDate.fromParts(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
    );

    if (dates.length > MAX_RANGE_DAYS) {
      throw new DomainError(
        'history.date_range_too_large',
        `Диапазон истории не может превышать ${MAX_RANGE_DAYS} день.`,
      );
    }

    cursor = new Date(cursor.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function toUtcDate(date: DayDate): Date {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

function deduplicateById<T extends { readonly id: { toString(): string } }>(
  items: readonly T[],
): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    unique.set(item.id.toString(), item);
  }
  return [...unique.values()];
}
