import type { FormEvent } from 'react';
import { DayDate } from '../../domain';
import {
  addDays,
  formatSelectedDateTitle,
  formatSelectedDateWeekday,
  isToday,
} from '../date/selectedDate';

interface SectionDateNavigatorProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly onDateChange: (date: DayDate) => void;
}

export function SectionDateNavigator({
  currentDate,
  selectedDate,
  onDateChange,
}: SectionDateNavigatorProps) {
  return (
    <section className="section-date-navigation" aria-label="Навигация по датам раздела">
      <div className="section-date-summary">
        <strong>{formatSelectedDateTitle(selectedDate, currentDate)}</strong>
        <span>{formatSelectedDateWeekday(selectedDate)}</span>
      </div>
      <div className="section-date-controls">
        <button
          className="section-date-arrow"
          type="button"
          aria-label="Открыть предыдущий день"
          onClick={() => onDateChange(addDays(selectedDate, -1))}
        >
          ←
        </button>
        <button
          className="secondary-button section-date-today"
          type="button"
          disabled={isToday(selectedDate, currentDate)}
          onClick={() => onDateChange(currentDate)}
        >
          Сегодня
        </button>
        <button
          className="section-date-arrow"
          type="button"
          aria-label="Открыть следующий день"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
        >
          →
        </button>
        <label className="section-date-picker">
          <span>Дата</span>
          <input
            type="date"
            value={selectedDate.toString()}
            onInput={(event: FormEvent<HTMLInputElement>) => {
              if (event.currentTarget.value.length > 0) {
                onDateChange(DayDate.create(event.currentTarget.value));
              }
            }}
          />
        </label>
      </div>
    </section>
  );
}
