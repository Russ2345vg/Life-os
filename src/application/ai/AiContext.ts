import type { AnalyticsSnapshotReader } from '../ports/AnalyticsSnapshotReader';
import type { GetAnalyticsOverview } from '../analytics/GetAnalyticsOverview';
import type { AnalyticsTopic } from '../analytics/GetAnalyticsOverview';
import type { PlannerInbox } from '../planner/PlannerInbox';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { projectAnalyticsForAi } from './AnalyticsAiProjection';
import { compareWhatIf, type WhatIfComparison, type WhatIfInput } from './WhatIfComparison';
import { projectSleepForAi } from './SleepAiProjection';

export const aiSections = [
  'today',
  'spheres',
  'directions',
  'needs',
  'goals',
  'actions',
  'inbox',
  'walks',
  'diary',
  'memory',
  'sleep',
  'analytics',
  'account',
] as const;
export type AiSection = (typeof aiSections)[number];
export interface AiScope {
  readonly section: AiSection;
  readonly date: string;
  readonly selectedId?: string;
  readonly period?: 'day' | 'week' | 'month';
  readonly topic?: AnalyticsTopic;
  readonly tomorrow?: boolean;
}
export interface AiSource {
  readonly id: string;
  readonly kind: AiSection;
  readonly title: string;
  readonly date: string | null;
  readonly detail: string;
}
export interface AiContext {
  readonly version: 1;
  readonly section: AiSection;
  readonly date: string;
  readonly period: { readonly start: string; readonly end: string } | null;
  readonly facts: readonly string[];
  readonly sources: readonly AiSource[];
  readonly omittedCount: number;
}

const MAX_SOURCES = 24;
const text = (value: string | null | undefined, limit = 480) =>
  (value ?? '').trim().slice(0, limit);
const source = (
  kind: AiSection,
  id: string,
  title: string,
  detail = '',
  date: string | null = null,
): AiSource => ({
  kind,
  id: text(id, 160),
  title: text(title, 200),
  detail: text(detail),
  date,
});
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);

/** Read-only, per-section projection. Raw snapshots never cross the AI boundary. */
export class ReadAiContext {
  constructor(
    private readonly snapshot: AnalyticsSnapshotReader,
    private readonly inbox: Pick<PlannerInbox, 'list'>,
    private readonly analytics: GetAnalyticsOverview,
  ) {}

  async compareWhatIf(input: WhatIfInput): Promise<WhatIfComparison> {
    return compareWhatIf(input, await this.snapshot.read());
  }

  async read(scope: AiScope): Promise<AiContext> {
    if (!validDate(scope.date)) throw new Error('Не удалось определить дату раздела.');
    const facts: string[] = [];
    let candidates: AiSource[] = [];
    let period: AiContext['period'] = null;
    if (scope.section === 'account') {
      facts.push('Раздел аккаунта: сведения о задачах и личных записях не передаются.');
    } else if (scope.section === 'inbox') {
      const ideas = await this.inbox.list();
      candidates = ideas
        .filter((item) => item.status === 'inbox')
        .map((item) =>
          source('inbox', item.id, item.title, item.note ?? '', item.createdAt.slice(0, 10)),
        );
    } else if (scope.section === 'analytics') {
      const report = await this.analytics.execute({
        period: scope.period === 'month' ? 'month' : 'week',
        date: scope.date,
      });
      period = { start: report.period.start, end: report.period.end };
      const projection = projectAnalyticsForAi(report, scope.topic ?? 'overview');
      facts.push(...projection.facts);
      candidates = projection.candidates.map((item) =>
        source(item.kind, item.id, item.title, item.detail, item.date),
      );
    } else {
      const data = await this.snapshot.read();
      const activeActions = data.actions.filter((item) => !item.deletedAt && !item.archivedAt);
      const activeGoals = data.goals.filter(
        (item) => !item.deletedAt && item.status !== 'archived',
      );
      switch (scope.section) {
        case 'today': {
          const day = scope.tomorrow ? addDays(scope.date, 1) : scope.date;
          period = { start: day, end: day };
          candidates = activeActions
            .filter((item) => item.plannedDate?.toString() === day && item.status !== 'cancelled')
            .map((item) =>
              source(
                'actions',
                item.id.toString(),
                item.title.toString(),
                `Статус: ${item.status}; оценка: ${item.estimateMinutes ?? 'нет'} мин; ${text(item.description, 220)}`,
                day,
              ),
            );
          facts.push(`Запланировано действий: ${candidates.length}`);
          break;
        }
        case 'spheres':
          candidates = data.spheres
            .filter(
              (item) =>
                item.status !== 'archived' &&
                (!scope.selectedId || item.id.toString() === scope.selectedId),
            )
            .map((item) => {
              const score = data.balance.find(
                (row) =>
                  row.entityType === 'sphere' &&
                  row.entityId === item.id.toString() &&
                  row.month === scope.date.slice(0, 7),
              );
              return source(
                'spheres',
                item.id.toString(),
                item.name,
                `Описание: ${text(item.description, 180)}; желаемый уровень: ${item.desiredLevel ?? 'нет данных'}; оценка месяца: ${score?.effectiveScore ?? 'нет данных'}`,
              );
            });
          break;
        case 'directions':
          candidates = data.directions
            .filter(
              (item) =>
                item.status !== 'archived' &&
                (!scope.selectedId || item.id.toString() === scope.selectedId),
            )
            .map((item) => {
              const score = data.balance.find(
                (row) =>
                  row.entityType === 'direction' &&
                  row.entityId === item.id.toString() &&
                  row.month === scope.date.slice(0, 7),
              );
              return source(
                'directions',
                item.id.toString(),
                item.name,
                `Намерение: ${text(item.strategicIntent, 170)}; желаемое состояние: ${text(item.desiredState, 170)}; оценка месяца: ${score?.effectiveScore ?? 'нет данных'}`,
              );
            });
          break;
        case 'needs': {
          const needs = [
            ...new Set([
              ...data.directions.map((item) => item.need),
              ...activeGoals.map((item) => item.need),
              ...activeActions.map((item) => item.need),
            ]),
          ].filter((item): item is string => typeof item === 'string' && !!item.trim());
          candidates = needs
            .filter((item) => !scope.selectedId || item === scope.selectedId)
            .map((item) => source('needs', item, item));
          break;
        }
        case 'goals':
          candidates = activeGoals
            .filter((item) => !scope.selectedId || item.id.toString() === scope.selectedId)
            .map((item) =>
              source(
                'goals',
                item.id.toString(),
                item.title,
                `Статус: ${item.status}; срок: ${item.dueDate ?? 'нет'}; описание: ${text(item.description, 240)}`,
                item.dueDate,
              ),
            );
          if (scope.selectedId)
            candidates.push(
              ...activeActions
                .filter((item) => item.goalId?.toString() === scope.selectedId)
                .map((item) =>
                  source(
                    'actions',
                    item.id.toString(),
                    item.title.toString(),
                    `Статус: ${item.status}; ${text(item.description, 220)}`,
                    item.plannedDate?.toString() ?? null,
                  ),
                ),
            );
          break;
        case 'actions':
          candidates = activeActions
            .filter((item) => !scope.selectedId || item.id.toString() === scope.selectedId)
            .map((item) =>
              source(
                'actions',
                item.id.toString(),
                item.title.toString(),
                `Статус: ${item.status}; дата: ${item.plannedDate?.toString() ?? 'нет'}; ${text(item.description, 260)}`,
                item.plannedDate?.toString() ?? null,
              ),
            );
          break;
        case 'walks':
          candidates = data.walks
            .filter(
              (item) =>
                !item.deletedAt && (!scope.selectedId || item.id.toString() === scope.selectedId),
            )
            .map((item) =>
              source(
                'walks',
                item.id.toString(),
                `Прогулка ${item.date.toString()}`,
                `Статус: ${item.status}; результат: ${text(item.result, 330)}`,
                item.date.toString(),
              ),
            );
          break;
        case 'diary': {
          const entries = data.diary
            .filter(
              (item) =>
                item.status === 'completed' &&
                (!scope.period || item.kind === scope.period) &&
                item.periodStart.toString() <= scope.date,
            )
            .sort((a, b) => b.periodStart.toString().localeCompare(a.periodStart.toString()));
          candidates = entries.map((item) =>
            source(
              'diary',
              item.id.toString(),
              `Дневник: ${item.periodStart.toString()}`,
              Object.values(item.payload)
                .filter((value): value is string => typeof value === 'string')
                .join(' · '),
              item.periodStart.toString(),
            ),
          );
          break;
        }
        case 'memory':
          candidates = data.memory
            .filter(
              (item) =>
                !item.deletedAt && (!scope.selectedId || item.id.toString() === scope.selectedId),
            )
            .map((item) =>
              source(
                'memory',
                item.id.toString(),
                item.title,
                item.body,
                item.occurredOn.toString(),
              ),
            );
          break;
        case 'sleep': {
          const sleep = data.sleep;
          const night = sleep?.nightCycles.find((item) => item.cycleDate === scope.date);
          const projection = projectSleepForAi({
            observations: data.sleepObservations,
            plans: sleep?.nightCycles ?? [],
            from: addDays(scope.date, -13),
            to: scope.date,
          });
          candidates = projection.sources.map((item) =>
            source(item.kind, item.id, item.title, item.detail, item.date),
          );
          facts.push(...projection.facts);
          facts.push(`Записанных ночей: ${sleep?.nightCycles.length ?? 0}`);
          if (night)
            facts.push(
              `Состояние подготовки за ${scope.date}: ${night.preparationCompletionKind ?? 'нет отметки'}`,
            );
          break;
        }
      }
    }
    // A selected entity stays visible even when the collection is larger than the budget.
    const ordered =
      scope.section === 'analytics'
        ? candidates
        : candidates.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const sources: AiSource[] = [];
    for (const item of ordered) {
      if (
        sources.length >= MAX_SOURCES ||
        new TextEncoder().encode(JSON.stringify({ facts, sources: [...sources, item] }))
          .byteLength > 16_000
      )
        break;
      sources.push(item);
    }
    const omittedCount = Math.max(0, ordered.length - sources.length);
    return {
      version: 1,
      section: scope.section,
      date: scope.date,
      period,
      facts: facts.map((item) => text(item, 180)),
      sources,
      omittedCount,
    };
  }
}
