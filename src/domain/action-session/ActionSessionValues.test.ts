import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { PauseInterval } from './PauseInterval';
import { SessionResultNote } from './SessionResultNote';

describe('PauseInterval', () => {
  it('создаёт неизменяемый интервал и возвращает длительность в миллисекундах', () => {
    const startedAt = new Date('2026-08-01T09:00:00.000+09:00');
    const endedAt = new Date('2026-08-01T09:05:30.000+09:00');
    const interval = PauseInterval.create(startedAt, endedAt);

    expect(interval.durationMilliseconds).toBe(330_000);

    startedAt.setFullYear(2030);
    endedAt.setFullYear(2030);
    interval.startedAt.setFullYear(2040);
    interval.endedAt.setFullYear(2040);

    expect(interval.startedAt).toEqual(new Date('2026-08-01T09:00:00.000+09:00'));
    expect(interval.endedAt).toEqual(new Date('2026-08-01T09:05:30.000+09:00'));
  });

  it('разрешает нулевую длительность', () => {
    const moment = new Date('2026-08-01T09:00:00.000+09:00');

    expect(PauseInterval.create(moment, moment).durationMilliseconds).toBe(0);
  });

  it('отклоняет обратный порядок времени', () => {
    expect(() =>
      PauseInterval.create(
        new Date('2026-08-01T09:01:00.000+09:00'),
        new Date('2026-08-01T09:00:00.000+09:00'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'action_session.pause_interval_reversed' }));
  });

  it('отклоняет некорректный Date', () => {
    expect(() => PauseInterval.create(new Date(Number.NaN), new Date())).toThrow(DomainError);
  });
});

describe('SessionResultNote', () => {
  it('нормализует запись, предоставляет строку и сравнение по значению', () => {
    const note = SessionResultNote.create('  Подготовлен первый вариант  ');

    expect(note.toString()).toBe('Подготовлен первый вариант');
    expect(note.equals(SessionResultNote.create('Подготовлен первый вариант'))).toBe(true);
  });

  it('отклоняет пустую запись', () => {
    expect(() => SessionResultNote.create('   ')).toThrowError(
      expect.objectContaining({ code: 'session_result_note.invalid' }),
    );
  });

  it('ограничивает длину записи тысячей символов', () => {
    expect(SessionResultNote.create('а'.repeat(1_000)).toString()).toHaveLength(1_000);
    expect(() => SessionResultNote.create('а'.repeat(1_001))).toThrow(DomainError);
  });
});
