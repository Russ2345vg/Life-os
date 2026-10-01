import { describe, expect, it } from 'vitest';
import { planGoalGuidanceStep } from './plannerGoalGuidanceOperations';

describe('planGoalGuidanceStep', () => {
  it('does not refresh when the write fails', async () => {
    let reads = 0;
    const result = await planGoalGuidanceStep(
      async () => {
        throw new Error('Запись не удалась');
      },
      async () => {
        reads++;
      },
    );
    expect(result).toEqual({ status: 'not-committed', message: 'Запись не удалась' });
    expect(reads).toBe(0);
  });

  it('keeps commit distinct from a failed read and never repeats the write on retry', async () => {
    let writes = 0;
    let reads = 0;
    const work = async () => {
      writes++;
      return { actionId: 'a', date: '2026-10-01' };
    };
    const refresh = async () => {
      reads++;
      if (reads === 1) throw new Error('Чтение не удалось');
    };
    expect(await planGoalGuidanceStep(work, refresh)).toEqual({
      status: 'committed',
      actionId: 'a',
      date: '2026-10-01',
      refresh: 'failed',
      message: 'Чтение не удалось',
    });
    await refresh();
    expect(writes).toBe(1);
    expect(reads).toBe(2);
  });
});
