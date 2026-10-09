import { DayDate, diaryPeriod } from '../../domain';
import type { DiaryDayEntry, Goal, LifeAction } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { addDays, automaticPeriod } from '../../domain/planner/PlanningPeriod';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import { analyzeWalks } from '../walk/WalkAnalytics';
import { inclusiveDays, summarizeDiaryRatings } from '../diary/DiarySummary';
import { buildWorkTimeReport } from '../queries/GetWorkTimeReport';
import type { WorkTimeReport, WorkTimeRow } from '../queries/GetWorkTimeReport';
import type { AnalyticsSnapshot, AnalyticsSnapshotReader } from '../ports/AnalyticsSnapshotReader';
import { createGoalProgressReader } from '../planner/GoalContributions';
import { localDate } from '../planner/planningSupport';
import { summarizeSleepObservations } from '../../domain/sleep/SleepObservation';
import { rankCompletedActions, type ActionRankingRow } from './ActionRankings';

export type AnalyticsPeriodKind = 'week' | 'month';
export type AnalyticsTopic =
  'overview' | 'results' | 'time' | 'goals' | 'balance' | 'state' | 'rest' | 'memory';
export interface AnalyticsPeriod {
  readonly kind: AnalyticsPeriodKind;
  readonly start: string;
  readonly end: string;
  readonly previousStart: string;
  readonly previousEnd: string;
  readonly comparisonCurrentEnd: string | null;
  readonly comparisonPreviousEnd: string | null;
}
export interface AnalyticsDay {
  readonly date: string;
  readonly completed: readonly LifeAction[];
  readonly timeMilliseconds: number;
  readonly energy: number | null;
  readonly energyRecorded: boolean;
  readonly goalIds: readonly string[];
}
export interface AnalyticsGoalRow {
  readonly goal: Goal;
  readonly contributions: readonly ProgressContribution[];
  readonly knownAmount: number;
  readonly pending: number;
  readonly currentProgress: {
    readonly current: number;
    readonly target: number;
    readonly percent: number | null;
  } | null;
}
export interface AnalyticsSphereTime {
  readonly id: string | null;
  readonly name: string;
  readonly milliseconds: number;
}
export interface AnalyticsOverview {
  readonly asOf: Date;
  readonly period: AnalyticsPeriod;
  readonly days: readonly AnalyticsDay[];
  readonly previousDays: readonly AnalyticsDay[];
  readonly work: WorkTimeReport;
  readonly timeEvidence: readonly {
    readonly date: string;
    readonly rows: readonly WorkTimeRow[];
  }[];
  readonly completedCount: number;
  readonly timeMilliseconds: number;
  readonly goalsWithContribution: number;
  readonly energy: number | null;
  readonly energySamples: number;
  readonly mood: number | null;
  readonly productivity: number | null;
  readonly overall: number | null;
  readonly completedDiaryDays: number;
  readonly comparison: {
    readonly completedDifference: number | null;
    readonly timeDifferenceMs: number | null;
    readonly energyDifference: number | null;
  };
  readonly goalRows: readonly AnalyticsGoalRow[];
  readonly goalActionCounts: readonly ActionRankingRow[];
  readonly directionActionCounts: readonly ActionRankingRow[];
  readonly sphereTime: readonly AnalyticsSphereTime[];
  readonly balance: AnalyticsSnapshot['balance'];
  readonly walks: ReturnType<typeof analyzeWalks>;
  readonly preparation: { readonly allDone: number; readonly withSkips: number };
  readonly sleep: ReturnType<typeof summarizeSleepObservations> & {
    readonly missingCount: number;
    readonly averageBedtimePlanDeviationMinutes: number | null;
    readonly averageWakePlanDeviationMinutes: number | null;
  };
  readonly memory: AnalyticsSnapshot['memory'];
  readonly sources: AnalyticsSnapshot;
}

const capacity = [null, null, null, null, null, null, null];

function monthEnd(start: string): string {
  return diaryPeriod('month', DayDate.create(start)).periodEnd.toString();
}
function previousMonth(start: string): string {
  return `${addDays(start, -1).slice(0, 7)}-01`;
}
export const localAnalyticsDate = localDate;
export function resolveAnalyticsPeriod(
  kind: AnalyticsPeriodKind,
  requested: string | undefined,
  today: string,
): AnalyticsPeriod {
  const currentStart =
    kind === 'week' ? automaticPeriod('week', today).startDate : `${today.slice(0, 7)}-01`;
  const fallback = kind === 'week' ? addDays(currentStart, -7) : previousMonth(currentStart);
  let anchor = fallback;
  if (requested) {
    try {
      anchor = DayDate.create(requested).toString();
    } catch {
      /* Keep last full period. */
    }
  }
  const start =
    (kind === 'week' ? automaticPeriod('week', anchor).startDate : `${anchor.slice(0, 7)}-01`) >
    currentStart
      ? currentStart
      : kind === 'week'
        ? automaticPeriod('week', anchor).startDate
        : `${anchor.slice(0, 7)}-01`;
  const end = kind === 'week' ? addDays(start, 6) : monthEnd(start);
  const previousStart = kind === 'week' ? addDays(start, -7) : previousMonth(start);
  const previousEnd = kind === 'week' ? addDays(previousStart, 6) : monthEnd(previousStart);
  if (end < today) {
    return {
      kind,
      start,
      end,
      previousStart,
      previousEnd,
      comparisonCurrentEnd: end,
      comparisonPreviousEnd: previousEnd,
    };
  }
  const completeDays = Math.max(0, inclusiveDays(start, today) - 1);
  const comparable = Math.min(completeDays, inclusiveDays(previousStart, previousEnd));
  return {
    kind,
    start,
    end,
    previousStart,
    previousEnd,
    comparisonCurrentEnd: comparable ? addDays(start, comparable - 1) : null,
    comparisonPreviousEnd: comparable ? addDays(previousStart, comparable - 1) : null,
  };
}

function completedOn(action: LifeAction): string | null {
  return action.completedOn ?? (action.completedAt ? localAnalyticsDate(action.completedAt) : null);
}
function validContributions(snapshot: AnalyticsSnapshot): readonly ProgressContribution[] {
  const actions = new Map(
    snapshot.actions
      .filter((action) => !action.isDeleted())
      .map((action) => [action.id.toString(), action]),
  );
  const goals = new Set(
    snapshot.goals.filter((goal) => !goal.isDeleted()).map((goal) => goal.id.toString()),
  );
  return snapshot.contributions.filter(
    (fact) =>
      fact.source !== 'initial' && goals.has(fact.goalId) && contributionIsEffective(fact, actions),
  );
}
function daySeries(
  snapshot: AnalyticsSnapshot,
  from: string,
  to: string,
  asOf: Date,
  facts: readonly ProgressContribution[],
): AnalyticsDay[] {
  const actions = snapshot.actions.filter(
    (action) =>
      action.status === 'completed' &&
      !action.isDeleted() &&
      (!action.completedAt || action.completedAt <= asOf),
  );
  const report = buildWorkTimeReport({
    from,
    to,
    asOf,
    actions: snapshot.actions,
    sessions: snapshot.sessions,
    weekdays: capacity,
  });
  const days: AnalyticsDay[] = [];
  for (const work of report.days) {
    const entries = snapshot.diary.filter(
      (entry): entry is DiaryDayEntry =>
        entry.kind === 'day' &&
        entry.status === 'completed' &&
        entry.periodStart.toString() === work.date,
    );
    const energy = summarizeDiaryRatings(entries, 1).energy;
    days.push({
      date: work.date,
      completed: actions.filter((action) => completedOn(action) === work.date),
      timeMilliseconds: work.actualMilliseconds,
      energy: energy.value,
      energyRecorded: energy.sampleCount > 0,
      goalIds: [
        ...new Set(
          facts
            .filter((fact) => fact.effectiveDate === work.date && fact.amount !== null)
            .map((fact) => fact.goalId),
        ),
      ],
    });
  }
  return days;
}
export function buildAnalyticsOverview(
  snapshot: AnalyticsSnapshot,
  period: AnalyticsPeriod,
  asOf: Date,
): AnalyticsOverview {
  const today = localAnalyticsDate(asOf);
  const through = period.end < today ? period.end : today;
  const facts = validContributions(snapshot);
  const days = daySeries(snapshot, period.start, through, asOf, facts);
  const previousDays = daySeries(snapshot, period.previousStart, period.previousEnd, asOf, facts);
  const work = buildWorkTimeReport({
    from: period.start,
    to: through,
    asOf,
    actions: snapshot.actions,
    sessions: snapshot.sessions,
    weekdays: capacity,
  });
  const timeEvidence = days
    .filter((day) => day.timeMilliseconds > 0)
    .map((day) => ({
      date: day.date,
      rows: buildWorkTimeReport({
        from: day.date,
        to: day.date,
        asOf,
        actions: snapshot.actions,
        sessions: snapshot.sessions,
        weekdays: capacity,
      }).rows.filter((row) => row.actualMilliseconds > 0),
    }));
  const dayEntries = snapshot.diary.filter(
    (entry): entry is DiaryDayEntry =>
      entry.kind === 'day' &&
      entry.status === 'completed' &&
      entry.periodStart.toString() >= period.start &&
      entry.periodStart.toString() <= through,
  );
  const ratings = summarizeDiaryRatings(dayEntries, inclusiveDays(period.start, through));
  const readProgress = createGoalProgressReader({
    goals: [...snapshot.goals],
    actions: snapshot.actions.filter((action) => !action.isDeleted()),
    contributions: snapshot.contributions.filter((fact) => !fact.voided),
  });
  const goalRows = snapshot.goals
    .filter((goal) => !goal.isDeleted())
    .map((goal) => {
      const contributions = facts.filter(
        (fact) =>
          fact.goalId === goal.id.toString() &&
          fact.effectiveDate >= period.start &&
          fact.effectiveDate <= through,
      );
      return {
        goal,
        contributions,
        knownAmount: contributions.reduce((sum, fact) => sum + (fact.amount ?? 0), 0),
        pending: contributions.filter((fact) => fact.amount === null).length,
        currentProgress: readProgress(goal.id.toString(), today),
      };
    })
    .filter((row) => row.contributions.length)
    .sort((a, b) => b.contributions.length - a.contributions.length);
  const directions = new Map(
    snapshot.directions.map((direction) => [direction.id.toString(), direction]),
  );
  const actionRankings = rankCompletedActions({
    actions: days.flatMap((day) => day.completed),
    goals: snapshot.goals,
    directions: snapshot.directions,
    contributions: facts,
  });
  const spheres = new Map(snapshot.spheres.map((sphere) => [sphere.id.toString(), sphere]));
  const sphereTime = new Map<string | null, number>();
  for (const goalTime of work.goals) {
    if (!goalTime.actualMilliseconds) continue;
    const goal = snapshot.goals.find(
      (item) => item.id.toString() === goalTime.goalId && !item.isDeleted(),
    );
    const sphereId =
      goal?.sphereId?.toString() ??
      (goal?.directionId
        ? directions.get(goal.directionId.toString())?.sphereId?.toString()
        : undefined) ??
      null;
    const id = sphereId && spheres.has(sphereId) ? sphereId : null;
    sphereTime.set(id, (sphereTime.get(id) ?? 0) + goalTime.actualMilliseconds);
  }
  const matchedWalks = snapshot.walks.filter(
    (walk) => walk.date.toString() >= period.start && walk.date.toString() <= through,
  );
  const memory = snapshot.memory.filter(
    (event) =>
      event.deletedAt === null &&
      event.occurredOn.toString() >= period.start &&
      event.occurredOn.toString() <= through,
  );
  const nightCycles =
    snapshot.sleep?.nightCycles.filter(
      (cycle) => cycle.cycleDate >= period.start && cycle.cycleDate <= through,
    ) ?? [];
  const sleepObservations = snapshot.sleepObservations.filter(
    ({ cycleDate }) => cycleDate >= period.start && cycleDate <= through,
  );
  const sleepSummary = summarizeSleepObservations(sleepObservations);
  const confirmedSleep = sleepObservations.filter(
    (observation) =>
      observation.confirmedAt !== null &&
      observation.wentToBedAt !== null &&
      observation.wokeAt !== null,
  );
  const planByCycle = new Map(nightCycles.map((cycle) => [cycle.cycleDate, cycle]));
  const bedtimeDeviations = confirmedSleep.flatMap((observation) => {
    const plan = planByCycle.get(observation.cycleDate);
    return plan && observation.wentToBedAt
      ? [Math.abs(observation.wentToBedAt.getTime() - plan.plannedSleepAt.getTime()) / 60_000]
      : [];
  });
  const wakeDeviations = confirmedSleep.flatMap((observation) => {
    const plan = planByCycle.get(observation.cycleDate);
    return plan && observation.wokeAt
      ? [Math.abs(observation.wokeAt.getTime() - plan.plannedWakeAt.getTime()) / 60_000]
      : [];
  });
  const comparableCurrent = days.filter(
    (day) => period.comparisonCurrentEnd && day.date <= period.comparisonCurrentEnd,
  );
  const comparablePrevious = previousDays.filter(
    (day) => period.comparisonPreviousEnd && day.date <= period.comparisonPreviousEnd,
  );
  const currentEnergy = summarizeDiaryRatings(
    dayEntries.filter(
      (entry) =>
        period.comparisonCurrentEnd && entry.periodStart.toString() <= period.comparisonCurrentEnd,
    ),
    comparableCurrent.length,
  ).energy;
  const previousEnergy = summarizeDiaryRatings(
    snapshot.diary.filter(
      (entry): entry is DiaryDayEntry =>
        entry.kind === 'day' &&
        entry.status === 'completed' &&
        entry.periodStart.toString() >= period.previousStart &&
        !!period.comparisonPreviousEnd &&
        entry.periodStart.toString() <= period.comparisonPreviousEnd,
    ),
    comparablePrevious.length,
  ).energy;
  return {
    asOf,
    period,
    days,
    previousDays,
    work,
    timeEvidence,
    completedCount: days.reduce((sum, day) => sum + day.completed.length, 0),
    timeMilliseconds: work.actualMilliseconds,
    goalsWithContribution: new Set(days.flatMap((day) => day.goalIds)).size,
    energy: ratings.energy.value,
    energySamples: ratings.energy.sampleCount,
    mood: ratings.mood.value,
    productivity: ratings.productivity.value,
    overall: ratings.overall.value,
    completedDiaryDays: ratings.completedDays,
    comparison: {
      completedDifference: comparableCurrent.length
        ? comparableCurrent.reduce((sum, day) => sum + day.completed.length, 0) -
          comparablePrevious.reduce((sum, day) => sum + day.completed.length, 0)
        : null,
      timeDifferenceMs: comparableCurrent.length
        ? comparableCurrent.reduce((sum, day) => sum + day.timeMilliseconds, 0) -
          comparablePrevious.reduce((sum, day) => sum + day.timeMilliseconds, 0)
        : null,
      energyDifference:
        currentEnergy.sampleCount >= 3 &&
        previousEnergy.sampleCount >= 3 &&
        currentEnergy.value !== null &&
        previousEnergy.value !== null
          ? currentEnergy.value - previousEnergy.value
          : null,
    },
    goalRows,
    ...actionRankings,
    sphereTime: [...sphereTime]
      .map(([id, milliseconds]) => ({
        id,
        milliseconds,
        name: id ? (spheres.get(id)?.name ?? 'Без сферы') : 'Без сферы',
      }))
      .sort((a, b) => b.milliseconds - a.milliseconds),
    balance: snapshot.balance.filter(
      (item) =>
        item.month >= period.start.slice(0, 7) &&
        item.month <= through.slice(0, 7) &&
        item.entityType === 'sphere',
    ),
    walks: analyzeWalks(matchedWalks),
    preparation: {
      allDone: nightCycles.filter((cycle) => cycle.preparationCompletionKind === 'ALL_DONE').length,
      withSkips: nightCycles.filter((cycle) => cycle.preparationCompletionKind === 'WITH_SKIPS')
        .length,
    },
    sleep: {
      ...sleepSummary,
      missingCount: Math.max(
        0,
        inclusiveDays(period.start, through) -
          new Set(sleepObservations.map(({ cycleDate }) => cycleDate)).size,
      ),
      averageBedtimePlanDeviationMinutes: averageMinutes(bedtimeDeviations),
      averageWakePlanDeviationMinutes: averageMinutes(wakeDeviations),
    },
    memory,
    sources: snapshot,
  };
}

function averageMinutes(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export class GetAnalyticsOverview {
  constructor(
    private readonly reader: AnalyticsSnapshotReader,
    private readonly now: () => Date,
  ) {}
  subscribe(listener: () => void): () => void {
    return this.reader.subscribe(listener);
  }
  async execute(input: {
    readonly period: AnalyticsPeriodKind;
    readonly date?: string;
  }): Promise<AnalyticsOverview> {
    const asOf = this.now();
    const period = resolveAnalyticsPeriod(input.period, input.date, localAnalyticsDate(asOf));
    return buildAnalyticsOverview(await this.reader.read(), period, asOf);
  }
}
