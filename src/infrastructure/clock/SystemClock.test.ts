import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from './SystemClock';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('возвращает текущее системное время', () => {
    const expectedTime = new Date('2026-08-01T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(expectedTime);

    expect(new SystemClock().now()).toEqual(expectedTime);
  });
});
