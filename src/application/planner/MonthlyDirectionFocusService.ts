import { EntityId, type DayDate } from '../../domain';
import {
  changeMonthlyDirectionFocus,
  monthlyDirectionFocusMonth,
  type MonthlyDirectionFocus,
} from '../../domain/planner/MonthlyDirectionFocus';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { DayRepository } from '../ports/DayRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { MonthlyDirectionFocusRepository } from '../ports/MonthlyDirectionFocusRepository';

export interface MonthlyDirectionFocusSuggestion {
  readonly directionId: string;
  readonly source: 'previous_month' | 'legacy_day';
}

export interface MonthlyDirectionFocusState {
  readonly month: string;
  readonly current: MonthlyDirectionFocus | null;
  readonly suggestion: MonthlyDirectionFocusSuggestion | null;
}

export class MonthlyDirectionFocusService {
  public constructor(
    private readonly repository: MonthlyDirectionFocusRepository,
    private readonly directions: DirectionRepository,
    private readonly days: DayRepository,
    private readonly clock: Clock,
  ) {}

  public async get(date: DayDate): Promise<MonthlyDirectionFocusState> {
    const month = monthlyDirectionFocusMonth(date);
    const current = await this.repository.findByMonth(month);
    if (current !== null) return { month, current, suggestion: null };

    const previous = await this.repository.findLatestBefore(month);
    if (previous !== null) {
      return {
        month,
        current: null,
        suggestion: await this.availableSuggestion(previous.directionId, 'previous_month'),
      };
    }

    const legacy = await this.days.findByDate(date);
    return {
      month,
      current: null,
      suggestion: await this.availableSuggestion(
        legacy?.mainDirectionId?.toString() ?? null,
        'legacy_day',
      ),
    };
  }

  public async set(date: DayDate, directionId: EntityId | null): Promise<MonthlyDirectionFocus> {
    if (directionId !== null) {
      const direction = await this.directions.findById(directionId);
      if (direction?.status !== 'active')
        throw new DomainError(
          'monthly_direction_focus.direction_unavailable',
          'Выберите активное направление.',
        );
    }
    const month = monthlyDirectionFocusMonth(date);
    return this.repository.change(month, (current) =>
      changeMonthlyDirectionFocus(
        current,
        month,
        directionId?.toString() ?? null,
        this.clock.now(),
      ),
    );
  }

  private async availableSuggestion(
    directionId: string | null,
    source: MonthlyDirectionFocusSuggestion['source'],
  ): Promise<MonthlyDirectionFocusSuggestion | null> {
    if (directionId === null) return null;
    const direction = await this.directions.findById(EntityId.create(directionId));
    return direction?.status === 'active' ? { directionId, source } : null;
  }
}
