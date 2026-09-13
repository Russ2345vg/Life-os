import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal } from '../../domain';
import { createGoalDeleteController } from './GoalDeleteController';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function goal(): Goal {
  return Goal.create({ id: EntityId.create('goal-delete'), title: 'Тестовая цель', now: NOW });
}

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolvePromise: ((value: Value) => void) | undefined;
  return {
    promise: new Promise<Value>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve(value) {
      if (resolvePromise === undefined) throw new Error('Deferred promise is not ready.');
      resolvePromise(value);
    },
  };
}

describe('GoalDeleteController', () => {
  it('confirms once and shares one pending synced delete command', async () => {
    const request = deferred<boolean>();
    const deleteGoal = { execute: vi.fn().mockReturnValue(request.promise) };
    const confirm = vi.fn().mockReturnValue(true);
    const onDeleted = vi.fn();
    const onMutated = vi.fn();
    const controller = createGoalDeleteController({
      deleteGoal,
      confirm,
      onDeleted,
      onMutated,
    });

    const first = controller.delete(goal());
    const second = controller.delete(goal());

    expect(second).toBe(first);
    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteGoal.execute).toHaveBeenCalledOnce();
    expect(deleteGoal.execute).toHaveBeenCalledWith('goal-delete');

    request.resolve(true);
    await expect(first).resolves.toEqual({ status: 'success' });
    expect(onMutated).toHaveBeenCalledOnce();
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it('does not execute when confirmation is cancelled', async () => {
    const deleteGoal = { execute: vi.fn() };
    const controller = createGoalDeleteController({
      deleteGoal,
      confirm: () => false,
      onDeleted: vi.fn(),
      onMutated: vi.fn(),
    });

    await expect(controller.delete(goal())).resolves.toEqual({ status: 'cancelled' });
    expect(deleteGoal.execute).not.toHaveBeenCalled();
  });

  it('maps missing and thrown failures to safe retryable errors', async () => {
    const missing = createGoalDeleteController({
      deleteGoal: { execute: vi.fn().mockResolvedValue(false) },
      confirm: () => true,
      onDeleted: vi.fn(),
      onMutated: vi.fn(),
    });
    await expect(missing.delete(goal())).resolves.toEqual({
      status: 'error',
      message: 'Цель не найдена или имеет связанные записи. Цель со связями можно архивировать.',
    });

    const thrown = createGoalDeleteController({
      deleteGoal: { execute: vi.fn().mockRejectedValue(new Error('IndexedDB details')) },
      confirm: () => true,
      onDeleted: vi.fn(),
      onMutated: vi.fn(),
    });
    await expect(thrown.delete(goal())).resolves.toEqual({
      status: 'error',
      message: 'Не удалось удалить цель. Попробуйте ещё раз.',
    });
  });
});
