export interface WheelItem {
  readonly id: string;
  readonly name: string;
  readonly score: number | null;
  readonly desired: number | null;
}
const point = (r: number, angle: number) =>
  `${180 + r * Math.cos(angle)},${180 + r * Math.sin(angle)}`;
function wedge(radius: number, start: number, end: number) {
  return `M180,180 L${point(radius, start)} A${radius},${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(radius, end)} Z`;
}
export function BalanceWheel({ items }: { readonly items: readonly WheelItem[] }) {
  if (!items.length)
    return (
      <div className="balance-wheel-empty">
        <p>Выберите сферы для колеса</p>
        <span className="planner-muted">Добавьте важные для вас части жизни в настройках.</span>
      </div>
    );
  const width = (2 * Math.PI) / items.length;
  return (
    <svg
      className="balance-wheel"
      viewBox="0 0 360 360"
      role="img"
      aria-label="Колесо состояния жизни: текущие оценки и желаемый уровень"
    >
      {[2, 4, 6, 8, 10].map((n) => (
        <circle key={n} cx="180" cy="180" r={n * 13} className="balance-grid" />
      ))}
      {items.map((item, index) => {
        const middle = -Math.PI / 2 + index * width,
          start = middle - width * 0.47,
          end = middle + width * 0.47;
        const text = point(153, middle).split(',');
        return (
          <g key={item.id}>
            <title>{`${item.name}: ${item.score === null ? 'нет данных' : `${item.score.toFixed(1)} из 10`}${item.desired === null ? '' : `, желаемый ${item.desired}`}`}</title>
            <path d={wedge(130, start, end)} className="balance-sector" />
            {item.score !== null && item.score > 0 && (
              <path d={wedge(item.score * 13, start, end)} className="balance-score-sector" />
            )}
            {item.desired !== null && item.desired > 0 && (
              <path
                d={`M${point(item.desired * 13, start)} A${item.desired * 13},${item.desired * 13} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(item.desired * 13, end)}`}
                className="balance-desired"
              />
            )}
            <text x={text[0]} y={text[1]} textAnchor="middle" dominantBaseline="middle">
              {index + 1}
            </text>
            {item.score === null && (
              <text
                x={point(90, middle).split(',')[0]}
                y={point(90, middle).split(',')[1]}
                textAnchor="middle"
              >
                —
              </text>
            )}
          </g>
        );
      })}
      <circle cx="180" cy="180" r="3" fill="currentColor" />
    </svg>
  );
}
