import type { ActionRankingRow } from '../../../application/analytics/ActionRankings';

export function ActionRankingsPanel({
  goals,
  directions,
}: {
  readonly goals: readonly ActionRankingRow[];
  readonly directions: readonly ActionRankingRow[];
}) {
  const ranking = (title: string, rows: readonly ActionRankingRow[]) => (
    <div>
      <h3>{title}</h3>
      {rows.length ? (
        <ol className="analytics-action-ranking">
          {rows.map((row, index) => (
            <li className="analytics-detail-row" key={row.id}>
              <span aria-hidden="true">{index + 1}.</span>
              <strong>{row.name}</strong>
              <span>
                {row.count} {actionCountWord(row.count)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="analytics-footnote">Нет выполненных действий с такой связью.</p>
      )}
    </div>
  );
  return (
    <section
      className="analytics-secondary-panel"
      aria-label="Выполненные действия по целям и направлениям"
    >
      <h2>На чём вы работали</h2>
      <p className="analytics-footnote">Число выполненных действий за выбранный период.</p>
      <div className="analytics-action-rankings">
        {ranking('По целям', goals)}
        {ranking('По направлениям', directions)}
      </div>
    </section>
  );
}

function actionCountWord(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'действий';
  if (count % 10 === 1) return 'действие';
  if (count % 10 >= 2 && count % 10 <= 4) return 'действия';
  return 'действий';
}
