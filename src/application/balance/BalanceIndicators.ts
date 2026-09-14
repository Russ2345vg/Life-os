import type { BalanceRepository } from '../ports/BalanceRepository';
import type { Clock } from '../ports/Clock';
import { DomainError } from '../../shared/errors/DomainError';
import {
  indicatorId,
  validateIndicator,
  MAX_DIRECTION_INDICATORS,
  type IndicatorMeasure,
} from '../../domain/balance/DirectionIndicator';
import type { BalanceImportance } from '../../domain/balance/BalanceImportance';
export type IndicatorDraft = IndicatorMeasure & {
  readonly name: string;
  readonly importance: BalanceImportance;
  readonly sourceType: 'manual' | 'quantitativeGoal';
  readonly sourceGoalId: string | null;
};
export class BalanceIndicators {
  constructor(
    readonly repository: BalanceRepository,
    readonly clock: Clock,
  ) {}
  save(
    directionId: string,
    draft: IndicatorDraft,
    existing: { readonly id: string; readonly version: number } | null,
  ) {
    return this.repository.changeIndicators((state) => {
      if (!state.directions.some((d) => d.id.toString() === directionId))
        throw new DomainError('balance.direction_missing', 'Направление не найдено.');
      if (
        draft.sourceType === 'quantitativeGoal' &&
        !state.goals.some((g) => g.id.toString() === draft.sourceGoalId && g.measurement) &&
        !state.indicators.some(
          (i) =>
            i.id === existing?.id &&
            i.directionId === directionId &&
            i.sourceType === 'quantitativeGoal' &&
            i.sourceGoalId === draft.sourceGoalId,
        )
      )
        throw new DomainError(
          'balance.source_unavailable',
          'Выберите доступную количественную цель.',
        );
      const previous = existing
        ? state.indicators.find((i) => i.id === existing.id && i.directionId === directionId)
        : undefined;
      if (existing && (!previous || previous.version !== existing.version || previous.removed))
        throw new DomainError('balance.version_conflict', 'Показатель изменился. Обновите данные.');
      const free = Array.from({ length: MAX_DIRECTION_INDICATORS }, (_, slot) =>
        indicatorId(directionId, slot),
      ).find((id) => !state.indicators.some((i) => i.id === id && !i.removed));
      const id = existing?.id ?? free;
      if (!id)
        throw new DomainError('balance.indicator_limit', 'Можно добавить до пяти показателей.');
      const stored = state.indicators.find((i) => i.id === id);
      const now = this.clock.now().toISOString();
      const indicator = validateIndicator({
        ...draft,
        id,
        directionId,
        removed: false,
        schemaVersion: 1,
        version: (stored?.version ?? 0) + 1,
        createdAt: stored?.createdAt ?? now,
        updatedAt: now,
      });
      return { result: indicator, indicator };
    });
  }
  remove(id: string, version: number) {
    return this.repository.changeIndicators((state) => {
      const previous = state.indicators.find((i) => i.id === id);
      if (!previous || previous.version !== version)
        throw new DomainError('balance.version_conflict', 'Показатель изменился. Обновите данные.');
      const indicator = validateIndicator({
        ...previous,
        removed: true,
        version: version + 1,
        updatedAt: this.clock.now().toISOString(),
      });
      return { result: undefined, indicator };
    });
  }
}
