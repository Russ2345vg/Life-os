import { describe, expect, it } from 'vitest';
import { APPLICATION_MODE } from '../../application';
import { DayDate } from '../../domain';
import {
  eveningStartupDate,
  loadEveningStartup,
  tryBeginEveningStart,
} from './EveningStartupPresentation';

describe('eveningStartupDate', () => {
  it.each([APPLICATION_MODE.evening, APPLICATION_MODE.recovery] as const)(
    'возвращает дату цикла для режима %s после запуска',
    (mode) => {
      const cycleDate = DayDate.create('2026-08-05');

      expect(eveningStartupDate({ mode, cycleDate })).toBe(cycleDate);
    },
  );

  it('не открывает вечернюю сцену для активного дня', () => {
    expect(eveningStartupDate({ mode: APPLICATION_MODE.activeDay, cycleDate: null })).toBeNull();
  });

  it('после fail-soft ошибки повторно читает storage и восстанавливает режим без stack trace', async () => {
    const cycleDate = DayDate.create('2026-08-05');
    let attempts = 0;
    const query = {
      execute: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('IndexedDB stack details');
        return { mode: APPLICATION_MODE.recovery, cycleDate } as const;
      },
    };

    expect(await loadEveningStartup(query)).toEqual({ status: 'error' });
    expect(await loadEveningStartup(query)).toEqual({ status: 'ready', cycleDate });
    expect(attempts).toBe(2);
  });

  it('блокирует быстрый повторный запуск до завершения существующей команды', () => {
    const gate = { current: false };

    expect(tryBeginEveningStart(gate)).toBe(true);
    expect(tryBeginEveningStart(gate)).toBe(false);
    gate.current = false;
    expect(tryBeginEveningStart(gate)).toBe(true);
  });
});
