import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../test/helpers/Fakes';
import { SystemCurrentDateProvider } from './SystemCurrentDateProvider';

describe('SystemCurrentDateProvider', () => {
  it('использует локальные компоненты календарной даты, а не UTC-строку', () => {
    const localTime = new Date(2026, 7, 1, 23, 30, 0);
    const provider = new SystemCurrentDateProvider(new FakeClock(localTime));

    expect(provider.getCurrentDate().toString()).toBe('2026-08-01');
  });
});
