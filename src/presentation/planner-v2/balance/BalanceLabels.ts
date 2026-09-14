import type { BalanceImportance } from '../../../domain/balance/BalanceImportance';

export const balanceImportanceLabels: Record<BalanceImportance, string> = {
  low: 'Низкая',
  normal: 'Обычная',
  high: 'Высокая',
  critical: 'Ключевая',
};

export const scoreLabel = (score: number | null) =>
  score === null ? 'Нет данных' : score.toFixed(1);
