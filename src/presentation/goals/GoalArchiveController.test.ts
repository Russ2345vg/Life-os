import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import { createGoalArchiveController } from './GoalArchiveController';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function activeGoal(): Goal {
  return Goal.create({ id: EntityId.create('goal-home'), title: 'Собственный дом', now: NOW });
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

describe('GoalArchiveController', () => {
  it('confirms once and shares one pending archive command', async () => {
    const goal = activeGoal();
    const archived = goal.archive(new Date(NOW.getTime() + 1_000));
    const request = deferred<Result<Goal, DomainError>>();
    const archiveGoal = { execute: vi.fn().mockReturnValue(request.promise) };
    const confirm = vi.fn().mockReturnValue(true);
    const onMutated = vi.fn();
    const controller = createGoalArchiveController({ archiveGoal, confirm, onMutated });

    const first = controller.archive(goal);
    const second = controller.archive(goal);

    expect(second).toBe(first);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(
      'Архивировать цель? Она останется в истории и будет доступна в фильтре «Архив».',
    );
    expect(archiveGoal.execute).toHaveBeenCalledOnce();
    expect(archiveGoal.execute).toHaveBeenCalledWith({
      id: goal.id,
      expectedVersion: goal.version,
    });

    request.resolve(success(archived));
    await expect(first).resolves.toEqual({ status: 'success', goal: archived });
    expect(onMutated).toHaveBeenCalledOnce();
  });

  it('does not execute when confirmation is cancelled or Goal is already archived', async () => {
    const archiveGoal = { execute: vi.fn() };
    const cancelled = createGoalArchiveController({
      archiveGoal,
      confirm: vi.fn().mockReturnValue(false),
      onMutated: vi.fn(),
    });
    await expect(cancelled.archive(activeGoal())).resolves.toEqual({ status: 'cancelled' });

    const archived = activeGoal().archive(new Date(NOW.getTime() + 1_000));
    const alreadyArchived = createGoalArchiveController({
      archiveGoal,
      confirm: vi.fn().mockReturnValue(true),
      onMutated: vi.fn(),
    });
    await expect(alreadyArchived.archive(archived)).resolves.toEqual({
      status: 'success',
      goal: archived,
    });
    expect(archiveGoal.execute).not.toHaveBeenCalled();
  });

  it('maps application and thrown failures to safe retryable errors', async () => {
    const conflict = createGoalArchiveController({
      archiveGoal: {
        execute: vi
          .fn()
          .mockResolvedValue(
            failure(new DomainError('goal.version_conflict', 'Internal conflict details')),
          ),
      },
      confirm: () => true,
      onMutated: vi.fn(),
    });
    await expect(conflict.archive(activeGoal())).resolves.toEqual({
      status: 'error',
      message: 'Цель уже изменена. Обновите страницу и повторите.',
    });

    const thrown = createGoalArchiveController({
      archiveGoal: { execute: vi.fn().mockRejectedValue(new Error('IndexedDB details')) },
      confirm: () => true,
      onMutated: vi.fn(),
    });
    await expect(thrown.archive(activeGoal())).resolves.toEqual({
      status: 'error',
      message: 'Не удалось архивировать цель. Попробуйте ещё раз.',
    });
  });
});
