export interface WheelItem {
  readonly id: string;
  readonly name: string;
  readonly score: number | null;
  readonly desired: number | null;
}
const point = (radius: number, angle: number) => ({
  x: 240 + radius * Math.cos(angle),
  y: 210 + radius * Math.sin(angle),
});
export function BalanceWheel({ items }: { readonly items: readonly WheelItem[] }) {
  if (!items.length)
    return (
      <div className="balance-wheel-empty">
        <p>Выберите сферы для колеса</p>
        <span className="planner-muted">Добавьте важные для вас части жизни в настройках.</span>
      </div>
    );
  const angle = (index: number) => -Math.PI / 2 + (index * Math.PI * 2) / items.length;
  const series = (field: 'score' | 'desired') => {
    const complete = items.every((item) => item[field] !== null);
    const points = items.map((item, index) =>
      item[field] === null ? null : point(item[field] * 14, angle(index)),
    );
    return (
      <g className={field === 'score' ? 'balance-radar-current' : 'balance-radar-desired'}>
        {complete && items.length > 2 && (
          <polygon points={points.map((p) => `${p!.x},${p!.y}`).join(' ')} />
        )}
        {points.map((p, index) => {
          const next = points[(index + 1) % points.length];
          return (
            p && (
              <g key={items[index]!.id}>
                {!complete && next && <line x1={p.x} y1={p.y} x2={next.x} y2={next.y} />}
                <circle cx={p.x} cy={p.y} r="3" />
              </g>
            )
          );
        })}
      </g>
    );
  };
  return (
    <svg
      className="balance-wheel"
      viewBox="0 0 480 420"
      role="img"
      aria-label="Колесо состояния жизни: текущие оценки и желаемый уровень"
    >
      {[2, 4, 6, 8, 10].map((n) => (
        <g key={n}>
          <circle cx="240" cy="210" r={n * 14} className="balance-grid" />
          <text x="247" y={210 - n * 14} className="balance-wheel-scale">
            {n}
          </text>
        </g>
      ))}
      {items.map((item, index) => {
        const edge = point(140, angle(index));
        const label = point(168, angle(index));
        return (
          <g key={item.id}>
            <title>{`${item.name}: ${item.score === null ? 'нет данных' : `${item.score.toFixed(1)} из 10`}${item.desired === null ? '' : `, желаемый ${item.desired}`}`}</title>
            <line x1="240" y1="210" x2={edge.x} y2={edge.y} className="balance-grid" />
            <text
              x={Math.max(86, Math.min(394, label.x))}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {item.name.length > 24 ? `${item.name.slice(0, 22)}…` : item.name}
            </text>
            {item.score === null && (
              <text x={point(85, angle(index)).x} y={point(85, angle(index)).y} textAnchor="middle">
                —
              </text>
            )}
          </g>
        );
      })}
      {series('desired')}
      {series('score')}
    </svg>
  );
}
