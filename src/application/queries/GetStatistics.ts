import {
  ACTION_SESSION_STATUS,
  DECISION_STATUS,
  DayDate,
  JOURNAL_ENTRY_TYPE,
  WALK_STATUS,
  WALK_TYPE,
  type ActionSession,
  type EntityId,
  type JournalEntry,
  type LifeAction,
  type Walk,
  type WalkType,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { JournalRepository } from '../ports/JournalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { WalkRepository } from '../ports/WalkRepository';

export const STATISTICS_PERIOD_KIND = {
  day: 'day',
  week: 'week',
  month: 'month',
  custom: 'custom',
} as const;

export type StatisticsPeriod =
  | {
      readonly kind:
        | typeof STATISTICS_PERIOD_KIND.day
        | typeof STATISTICS_PERIOD_KIND.week
        | typeof STATISTICS_PERIOD_KIND.month;
      readonly date: DayDate;
    }
  | {
      readonly kind: typeof STATISTICS_PERIOD_KIND.custom;
      readonly startDate: DayDate;
      readonly endDate: DayDate;
    };

export interface ResolvedStatisticsPeriod {
  readonly kind: StatisticsPeriod['kind'];
  readonly startDate: DayDate;
  readonly endDate: DayDate;
}

export interface WalkStatisticsMetrics {
  readonly completedCount: number;
  readonly abandonedCount: number;
  readonly totalDurationMilliseconds: number | null;
  readonly averageDurationMilliseconds: number | null;
  readonly completedByType: Readonly<Record<WalkType, number>>;
}

export interface StatisticsMetrics {
  readonly decisionCount: number;
  readonly completedDecisionCount: number;
  readonly lifeActionCount: number;
  readonly workSessionCount: number;
  readonly workSessionDurationMilliseconds: number | null;
  readonly averageWorkSessionDurationMilliseconds: number | null;
  readonly walks: WalkStatisticsMetrics;
}

export interface LifeActionTimeStatistics {
  readonly lifeActionId: EntityId;
  readonly sphereId: EntityId | null;
  readonly workSessionCount: number;
  readonly durationMilliseconds: number;
}

export interface SphereStatistics {
  readonly sphereId: EntityId | null;
  readonly metrics: StatisticsMetrics;
}

export interface StatisticsSnapshot {
  readonly period: ResolvedStatisticsPeriod;
  readonly metrics: StatisticsMetrics;
  readonly lifeActionTime: readonly LifeActionTimeStatistics[];
  readonly bySphere: readonly SphereStatistics[];
}

export class GetStatistics {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #walkRepository: WalkRepository;
  readonly #journalRepository: JournalRepository;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    walkRepository: WalkRepository,
    journalRepository: JournalRepository,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#walkRepository = walkRepository;
    this.#journalRepository = journalRepository;
  }

  public async execute(period: StatisticsPeriod): Promise<StatisticsSnapshot> {
    const resolvedPeriod = resolveStatisticsPeriod(period);
    const [decisions, lifeActions, sessions, walks, journalEntries] = await Promise.all([
      loadAll(this.#decisionRepository.findAll?.bind(this.#decisionRepository), 'decisions'),
      loadAll(this.#lifeActionRepository.findAll?.bind(this.#lifeActionRepository), 'life actions'),
      loadAll(
        this.#actionSessionRepository.findAll?.bind(this.#actionSessionRepository),
        'work sessions',
      ),
      this.#walkRepository.findAll(),
      this.#journalRepository.findByEffectiveDateRange(
        resolvedPeriod.startDate,
        resolvedPeriod.endDate,
      ),
    ]);

    const uniqueDecisions = deduplicateById(decisions).filter(
      (decision) => decision.deletedAt === null,
    );
    const uniqueLifeActions = deduplicateById(lifeActions);
    const uniqueSessions = deduplicateById(sessions);
    const uniqueWalks = deduplicateById(walks);
    const decisionCreationIds = subjectIdsFor(journalEntries, JOURNAL_ENTRY_TYPE.decisionCreated);
    const completedSessionIds = subjectIdsFor(
      journalEntries,
      JOURNAL_ENTRY_TYPE.workSessionCompleted,
    );

    const periodDecisions = uniqueDecisions.filter(
      (decision) =>
        decisionCreationIds.has(decision.id.toString()) ||
        isLocalDateInPeriod(decision.createdAt, resolvedPeriod),
    );
    const completedDecisions = uniqueDecisions.filter(
      (decision) =>
        decision.status === DECISION_STATUS.confirmed &&
        isLocalDateInPeriod(decision.confirmedAt, resolvedPeriod),
    );
    const periodLifeActions = uniqueLifeActions.filter((lifeAction) =>
      isLocalDateInPeriod(lifeAction.createdAt, resolvedPeriod),
    );
    const completedSessions = uniqueSessions.filter(
      (session) =>
        session.status === ACTION_SESSION_STATUS.completed &&
        (completedSessionIds.has(session.id.toString()) ||
          isLocalDateInPeriod(session.completedAt, resolvedPeriod)),
    );
    const periodWalks = uniqueWalks.filter((walk) => isDayInPeriod(walk.date, resolvedPeriod));
    const lifeActionsById = new Map(
      uniqueLifeActions.map((lifeAction) => [lifeAction.id.toString(), lifeAction]),
    );

    const metrics = metricsFor(
      periodDecisions,
      completedDecisions,
      periodLifeActions,
      completedSessions,
      periodWalks,
    );
    const lifeActionTime = actionTimeFor(completedSessions, lifeActionsById);
    const bySphere = sphereStatisticsFor(
      periodDecisions,
      completedDecisions,
      periodLifeActions,
      completedSessions,
      periodWalks,
      lifeActionsById,
    );

    return Object.freeze({
      period: resolvedPeriod,
      metrics,
      lifeActionTime,
      bySphere,
    });
  }
}

export function resolveStatisticsPeriod(period: StatisticsPeriod): ResolvedStatisticsPeriod {
  if (period.kind === STATISTICS_PERIOD_KIND.custom) {
    if (period.startDate.isAfter(period.endDate)) {
      throw new DomainError(
        'analytics.invalid_date_range',
        'Начальная дата статистики не может быть позже конечной.',
      );
    }
    return Object.freeze({
      kind: period.kind,
      startDate: period.startDate,
      endDate: period.endDate,
    });
  }

  if (period.kind === STATISTICS_PERIOD_KIND.day) {
    return Object.freeze({ kind: period.kind, startDate: period.date, endDate: period.date });
  }

  if (period.kind === STATISTICS_PERIOD_KIND.week) {
    const dayOfWeek = toUtcDate(period.date).getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const startDate = shiftDayDate(period.date, -daysSinceMonday);
    return Object.freeze({
      kind: period.kind,
      startDate,
      endDate: shiftDayDate(startDate, 6),
    });
  }

  const [year, month] = dateParts(period.date);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Object.freeze({
    kind: period.kind,
    startDate: DayDate.fromParts(year, month, 1),
    endDate: DayDate.fromParts(year, month, endDay),
  });
}

function metricsFor(
  decisions: readonly { readonly sphereId: EntityId | null }[],
  completedDecisions: readonly { readonly sphereId: EntityId | null }[],
  lifeActions: readonly LifeAction[],
  sessions: readonly ActionSession[],
  walks: readonly Walk[],
): StatisticsMetrics {
  const sessionDurations = sessions.map(completedSessionDuration);
  const completedWalks = walks.filter((walk) => walk.status === WALK_STATUS.completed);
  const walkDurations = completedWalks.flatMap((walk) =>
    walk.actualDurationMilliseconds === null ? [] : [walk.actualDurationMilliseconds],
  );

  return Object.freeze({
    decisionCount: decisions.length,
    completedDecisionCount: completedDecisions.length,
    lifeActionCount: lifeActions.length,
    workSessionCount: sessions.length,
    workSessionDurationMilliseconds: sumOrNull(sessionDurations),
    averageWorkSessionDurationMilliseconds: averageOrNull(sessionDurations),
    walks: Object.freeze({
      completedCount: completedWalks.length,
      abandonedCount: walks.filter((walk) => walk.status === WALK_STATUS.abandoned).length,
      totalDurationMilliseconds: sumOrNull(walkDurations),
      averageDurationMilliseconds: averageOrNull(walkDurations),
      completedByType: countWalksByType(completedWalks),
    }),
  });
}

function actionTimeFor(
  sessions: readonly ActionSession[],
  lifeActionsById: ReadonlyMap<string, LifeAction>,
): readonly LifeActionTimeStatistics[] {
  const totals = new Map<
    string,
    { lifeActionId: EntityId; sphereId: EntityId | null; count: number; duration: number }
  >();

  for (const session of sessions) {
    const key = session.lifeActionId.toString();
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, {
        lifeActionId: session.lifeActionId,
        sphereId: lifeActionsById.get(key)?.sphereId ?? null,
        count: 1,
        duration: completedSessionDuration(session),
      });
    } else {
      existing.count += 1;
      existing.duration += completedSessionDuration(session);
    }
  }

  return Object.freeze(
    [...totals.values()]
      .sort((left, right) =>
        left.lifeActionId.toString().localeCompare(right.lifeActionId.toString()),
      )
      .map((value) =>
        Object.freeze({
          lifeActionId: value.lifeActionId,
          sphereId: value.sphereId,
          workSessionCount: value.count,
          durationMilliseconds: value.duration,
        }),
      ),
  );
}

function sphereStatisticsFor(
  decisions: readonly { readonly sphereId: EntityId | null }[],
  completedDecisions: readonly { readonly sphereId: EntityId | null }[],
  lifeActions: readonly LifeAction[],
  sessions: readonly ActionSession[],
  walks: readonly Walk[],
  lifeActionsById: ReadonlyMap<string, LifeAction>,
): readonly SphereStatistics[] {
  const sphereKeys = new Map<string, EntityId | null>();
  const remember = (sphereId: EntityId | null): void => {
    sphereKeys.set(sphereKey(sphereId), sphereId);
  };
  decisions.forEach((decision) => remember(decision.sphereId));
  completedDecisions.forEach((decision) => remember(decision.sphereId));
  lifeActions.forEach((lifeAction) => remember(lifeAction.sphereId));
  sessions.forEach((session) =>
    remember(lifeActionsById.get(session.lifeActionId.toString())?.sphereId ?? null),
  );
  walks
    .filter(
      (walk) => walk.status === WALK_STATUS.completed || walk.status === WALK_STATUS.abandoned,
    )
    .forEach((walk) => remember(walk.sphereId));

  return Object.freeze(
    [...sphereKeys.values()].sort(compareSphereIds).map((sphereId) => {
      const matches = (value: EntityId | null): boolean => sameSphere(value, sphereId);
      return Object.freeze({
        sphereId,
        metrics: metricsFor(
          decisions.filter((decision) => matches(decision.sphereId)),
          completedDecisions.filter((decision) => matches(decision.sphereId)),
          lifeActions.filter((lifeAction) => matches(lifeAction.sphereId)),
          sessions.filter((session) =>
            matches(lifeActionsById.get(session.lifeActionId.toString())?.sphereId ?? null),
          ),
          walks.filter((walk) => matches(walk.sphereId)),
        ),
      });
    }),
  );
}

function subjectIdsFor(
  entries: readonly JournalEntry[],
  type: JournalEntry['type'],
): ReadonlySet<string> {
  return new Set(
    entries.flatMap((entry) =>
      entry.type === type && entry.subjectId !== null ? [entry.subjectId.toString()] : [],
    ),
  );
}

function completedSessionDuration(session: ActionSession): number {
  const completedAt = session.completedAt;
  if (completedAt === null) {
    throw new DomainError(
      'analytics.invalid_completed_session',
      'Завершённая рабочая сессия не содержит времени завершения.',
    );
  }
  return session.workedDurationAt(completedAt);
}

function isLocalDateInPeriod(value: Date | null, period: ResolvedStatisticsPeriod): boolean {
  if (value === null) return false;
  return isDayInPeriod(
    DayDate.fromParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
    period,
  );
}

function isDayInPeriod(value: DayDate, period: ResolvedStatisticsPeriod): boolean {
  return !value.isBefore(period.startDate) && !value.isAfter(period.endDate);
}

function sumOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function averageOrNull(values: readonly number[]): number | null {
  const total = sumOrNull(values);
  return total === null ? null : total / values.length;
}

function countWalksByType(walks: readonly Walk[]): Readonly<Record<WalkType, number>> {
  const counts: Record<WalkType, number> = {
    [WALK_TYPE.restorative]: 0,
    [WALK_TYPE.mindful]: 0,
    [WALK_TYPE.reflection]: 0,
    [WALK_TYPE.physical]: 0,
    [WALK_TYPE.phoneFree]: 0,
  };
  for (const walk of walks) counts[walk.type] += 1;
  return Object.freeze(counts);
}

function deduplicateById<T extends { readonly id: EntityId }>(items: readonly T[]): readonly T[] {
  const unique = new Map<string, T>();
  for (const item of items) unique.set(item.id.toString(), item);
  return [...unique.values()];
}

async function loadAll<T>(
  findAll: (() => Promise<readonly T[]>) | undefined,
  sourceName: string,
): Promise<readonly T[]> {
  if (findAll === undefined) {
    throw new DomainError(
      'analytics.source_unavailable',
      `Источник аналитики «${sourceName}» не поддерживает полное чтение.`,
    );
  }
  return findAll();
}

function shiftDayDate(date: DayDate, days: number): DayDate {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function toUtcDate(date: DayDate): Date {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateParts(date: DayDate): readonly [number, number, number] {
  const [year, month, day] = date.toString().split('-').map(Number);
  return [year!, month!, day!];
}

function sphereKey(sphereId: EntityId | null): string {
  return sphereId?.toString() ?? '';
}

function sameSphere(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function compareSphereIds(left: EntityId | null, right: EntityId | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.toString().localeCompare(right.toString());
}
