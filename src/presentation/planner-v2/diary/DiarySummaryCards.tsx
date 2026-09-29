import { roundDiaryAverage, type DiaryRatingSummary } from '../../../application';

export function DiarySummaryCards({
  title,
  summary,
  completedActions,
  goalsWithRecords,
}: {
  readonly title: string;
  readonly summary: DiaryRatingSummary;
  readonly completedActions: number;
  readonly goalsWithRecords: number;
}) {
  const cards = [
    ['Продуктивность', summary.productivity.value],
    ['Энергия', summary.energy.value],
    ['Настроение', summary.mood.value],
    ['Общая оценка', summary.overall.value],
  ] as const;
  return (
    <aside className="planner-diary-summary" aria-labelledby="diary-summary-heading">
      <h2 id="diary-summary-heading">{title}</h2>
      <p className="planner-diary-coverage">
        <strong>{summary.completedDays}</strong> из {summary.totalDays} дней
      </p>
      <div className="planner-diary-metrics">
        {cards.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value === null ? '—' : format(roundDiaryAverage(value))}</strong>
          </div>
        ))}
      </div>
      <div className="planner-diary-facts">
        <h3>Факты из планировщика</h3>
        <p>Завершено действий: {completedActions}</p>
        <p>Целей с записями результата: {goalsWithRecords}</p>
      </div>
    </aside>
  );
}

function format(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
}
