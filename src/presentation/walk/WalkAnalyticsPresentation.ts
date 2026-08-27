import { walkConfidenceLevel, type WalkAnalyticsMetricKey } from '../../application';

export const WALK_ANALYTICS_METRICS: readonly {
  readonly key: WalkAnalyticsMetricKey;
  readonly label: string;
}[] = [
  { key: 'energy', label: 'Энергия' },
  { key: 'tension', label: 'Напряжение' },
  { key: 'clarity', label: 'Ясность' },
];

export function walkAnalyticsObservation(sampleSize: number): string | null {
  const confidence = walkConfidenceLevel(sampleSize);
  if (confidence === null) return null;
  if (confidence === 'preliminary')
    return 'Предварительное наблюдение — пока мало данных для устойчивого вывода.';
  return 'Наблюдается устойчивая закономерность. Это не доказывает причинную связь.';
}

const NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export function formatWalkAnalyticsValue(value: number | null, signed = false): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded < 0 ? '−' : signed ? '+' : ''}${NUMBER.format(Math.abs(rounded))}`;
}

export function walkAnalyticsSample(count: number): string {
  const ending = count % 10 === 1 && count % 100 !== 11 ? 'прогулки' : 'прогулок';
  return `На основе ${count} ${ending}`;
}

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function walkAnalyticsDate(date: string): string {
  return DATE.format(new Date(`${date}T12:00:00Z`));
}
