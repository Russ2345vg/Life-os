import type { AnalyticsOverview, AnalyticsTopic } from '../analytics/GetAnalyticsOverview';
import type { DiaryDayEntry } from '../../domain';
import type { AiSource } from './AiContext';
import { projectSleepForAi } from './SleepAiProjection';

type Group = 'actions' | 'goals' | 'spheres' | 'diary' | 'walks' | 'sleep' | 'memory';

const priority: Record<AnalyticsTopic, readonly Group[]> = {
  overview: ['actions', 'goals', 'diary', 'walks', 'spheres', 'sleep', 'memory'],
  results: ['actions', 'goals', 'diary', 'spheres', 'walks', 'sleep', 'memory'],
  time: ['actions', 'diary', 'goals', 'spheres', 'walks', 'sleep', 'memory'],
  goals: ['goals', 'actions', 'spheres', 'diary', 'walks', 'sleep', 'memory'],
  balance: ['spheres', 'goals', 'actions', 'diary', 'walks', 'sleep', 'memory'],
  state: ['diary', 'actions', 'walks', 'sleep', 'goals', 'spheres', 'memory'],
  rest: ['walks', 'diary', 'sleep', 'actions', 'goals', 'spheres', 'memory'],
  memory: ['memory', 'diary', 'actions', 'goals', 'spheres', 'walks', 'sleep'],
};
const topicName: Record<AnalyticsTopic, string> = {
  overview: 'обзор',
  results: 'результаты',
  time: 'время',
  goals: 'цели',
  balance: 'баланс сфер',
  state: 'состояние',
  rest: 'отдых и прогулки',
  memory: 'память жизни',
};

function groupComparison(
  label: string,
  withLabel: string,
  withoutLabel: string,
  days: AnalyticsOverview['days'],
  included: (day: AnalyticsOverview['days'][number]) => boolean,
): string {
  const rated = days.filter((day) => day.energyRecorded && day.energy !== null);
  const withSamples = rated.filter(included);
  const withoutSamples = rated.filter((day) => !included(day));
  const count = `${withLabel}: ${withSamples.length}; ${withoutLabel}: ${withoutSamples.length}`;
  if (withSamples.length < 3 || withoutSamples.length < 3)
    return `${label} — ${count}; для сравнения средних недостаточно данных (нужно ≥3 дня в каждой группе).`;
  const mean = (sample: typeof rated) =>
    Math.round((sample.reduce((sum, day) => sum + day.energy!, 0) / sample.length) * 10) / 10;
  return `${label} — ${withLabel}: ${withSamples.length} дн., средняя энергия ${mean(withSamples)}; ${withoutLabel}: ${withoutSamples.length} дн., средняя энергия ${mean(withoutSamples)}. Совпадение, не причинная связь.`;
}

/** Topic-ordered, numeric evidence from the authoritative analytics report. */
export function projectAnalyticsForAi(report: AnalyticsOverview, topic: AnalyticsTopic) {
  const days = new Set(report.days.map((day) => day.date));
  const walkDays = new Set(report.walks.days.map((day) => day.date));
  const sleepProjection = projectSleepForAi({
    observations: report.sources.sleepObservations,
    plans: report.sources.sleep?.nightCycles ?? [],
    from: report.period.start,
    to: report.period.end,
  });
  const sleepDays = new Set(sleepProjection.sources.map(({ date }) => date));
  const linkedGoalsByAction = new Map<string, Set<string>>();
  for (const row of report.goalRows)
    for (const contribution of row.contributions) {
      if (!contribution.actionId || contribution.amount === null) continue;
      const names = linkedGoalsByAction.get(contribution.actionId) ?? new Set<string>();
      names.add(row.goal.title);
      linkedGoalsByAction.set(contribution.actionId, names);
    }
  const facts = [
    `Тема аналитики: ${topicName[topic]}`,
    `Выполнено действий: ${report.completedCount}`,
    `Учтённое время (мин): ${Math.round(report.timeMilliseconds / 60_000)}`,
    `Целей с вкладом: ${report.goalsWithContribution}`,
    `Дневниковых дней: ${report.completedDiaryDays}; оценок энергии: ${report.energySamples}`,
    `Средняя энергия: ${report.energy ?? 'нет данных'}`,
    `Изменение действий к сравнимому периоду: ${report.comparison.completedDifference ?? 'нет данных'}`,
    `Прогулок: ${report.walks.completedCount}; пар оценок до/после: ${report.walks.pairedCount}`,
  ];
  if (topic === 'rest' || topic === 'state' || topic === 'overview')
    facts.push(
      groupComparison('Прогулка ↔ энергия', 'с прогулкой', 'без прогулки', report.days, (day) =>
        walkDays.has(day.date),
      ),
    );
  if (topic === 'rest' || topic === 'state' || topic === 'overview') {
    facts.push(...sleepProjection.facts);
    facts.push(
      groupComparison(
        'Время в постели ↔ энергия',
        'с наблюдением сна',
        'без наблюдения',
        report.days,
        (day) => sleepDays.has(day.date),
      ),
    );
  }
  if (topic === 'time' || topic === 'state' || topic === 'overview')
    facts.push(
      groupComparison(
        'Учтённое время ↔ энергия',
        'с учтённым временем',
        'без учтённого времени',
        report.days,
        (day) => day.timeMilliseconds > 0,
      ),
    );
  if (topic === 'state')
    facts.push(
      `Среднее настроение: ${report.mood ?? 'нет данных'}; продуктивность: ${report.productivity ?? 'нет данных'}`,
    );
  if (topic === 'rest')
    facts.push(
      `Подготовка ко сну: всё выполнено ${report.preparation.allDone} ночей; с пропусками ${report.preparation.withSkips}`,
    );
  if (topic === 'balance')
    facts.push(`Сфер с учтённым временем: ${report.sphereTime.filter((row) => row.id).length}`);
  if (topic === 'memory') facts.push(`Событий памяти за период: ${report.memory.length}`);

  const byGroup: Record<Group, AiSource[]> = {
    actions: report.days.flatMap((day) =>
      day.completed.map((action) => {
        const linked = linkedGoalsByAction.get(action.id.toString());
        return {
          kind: 'actions',
          id: action.id.toString(),
          title: action.title.toString(),
          detail: `Выполнено ${day.date}${linked ? `; Подтверждённый вклад в цели: ${[...linked].join(', ')}` : ''}`,
          date: day.date,
        };
      }),
    ),
    goals: report.goalRows.map((row) => ({
      kind: 'goals',
      id: row.goal.id.toString(),
      title: row.goal.title,
      detail: `Вкладов за период: ${row.contributions.length}; с известной величиной: ${row.contributions.length - row.pending}`,
      date: null,
    })),
    spheres: report.sphereTime
      .filter((row) => row.id !== null)
      .map((row) => ({
        kind: 'spheres',
        id: row.id!,
        title: row.name,
        detail: `Учтённое время: ${Math.round(row.milliseconds / 60_000)} мин`,
        date: null,
      })),
    diary: report.sources.diary
      .filter(
        (entry): entry is DiaryDayEntry =>
          entry.kind === 'day' &&
          entry.status === 'completed' &&
          days.has(entry.periodStart.toString()),
      )
      .map((entry) => ({
        kind: 'diary',
        id: entry.id.toString(),
        title: `Дневник: ${entry.periodStart.toString()}`,
        detail: `Энергия: ${entry.payload.energy ?? 'нет оценки'}; настроение: ${entry.payload.mood ?? 'нет оценки'}; продуктивность: ${entry.payload.productivity ?? 'нет оценки'}`,
        date: entry.periodStart.toString(),
      })),
    walks: report.sources.walks
      .filter(
        (walk) =>
          walk.deletedAt === null && walk.status === 'completed' && days.has(walk.date.toString()),
      )
      .map((walk) => ({
        kind: 'walks',
        id: walk.id.toString(),
        title: `Прогулка ${walk.date.toString()}`,
        detail: `Завершена; длительность ${Math.round((walk.actualDurationMilliseconds ?? 0) / 60_000)} мин; энергия до/после: ${walk.beforeState?.energy ?? 'нет оценки'}/${walk.afterState?.energy ?? 'нет оценки'}`,
        date: walk.date.toString(),
      })),
    sleep: sleepProjection.sources.filter((item) => days.has(item.date)),
    memory: report.memory
      .filter((event) => days.has(event.occurredOn.toString()))
      .map((event) => ({
        kind: 'memory',
        id: event.id.toString(),
        title: event.title,
        detail: '',
        date: event.occurredOn.toString(),
      })),
  };
  for (const group of priority[topic])
    byGroup[group].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const candidates: AiSource[] = [];
  const largest = Math.max(...priority[topic].map((group) => byGroup[group].length));
  for (let index = 0; index < largest; index++)
    for (const group of priority[topic]) {
      const item = byGroup[group][index];
      if (item) candidates.push(item);
    }
  return { facts, candidates };
}
