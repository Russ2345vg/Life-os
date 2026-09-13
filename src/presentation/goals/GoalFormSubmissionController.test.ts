import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success } from '../../shared/result/Result';
import { EntityId, Goal } from '../../domain';
import { createEmptyGoalFormDraft, type GoalFormDraft } from './GoalFormModel';
import { createGoalFormSubmissionController } from './GoalFormSubmissionController';

const NOW = new Date('2026-08-24T08:00:00.000Z');

function validDraft(): GoalFormDraft {
  return { ...createEmptyGoalFormDraft(), title: 'Собственный дом' };
}

function createdGoal(): Goal {
  return Goal.create({ id: EntityId.create('goal-created'), title: 'Собственный дом', now: NOW });
}

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      if (resolvePromise === undefined) throw new Error('Deferred promise is not ready.');
      resolvePromise(value);
    },
  };
}

describe('GoalFormSubmissionController', () => {
  it('does not execute the command when presentation validation fails', async () => {
    const execute = vi.fn();
    const controller = createGoalFormSubmissionController({ mode: 'create', execute });

    await expect(controller.submit(createEmptyGoalFormDraft())).resolves.toMatchObject({
      status: 'invalid',
      errors: { title: 'Название цели обязательно.' },
      firstInvalidField: 'title',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('shares one pending promise and publishes success exactly once', async () => {
    const request = deferred<ReturnType<typeof success<Goal>>>();
    const publish = vi.fn();
    const execute = vi.fn().mockReturnValue(request.promise);
    const controller = createGoalFormSubmissionController({ mode: 'create', execute, publish });

    const first = controller.submit(validDraft());
    const second = controller.submit(validDraft());

    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledOnce();
    expect(controller.getState()).toEqual({ status: 'submitting' });

    const goal = createdGoal();
    request.resolve(success(goal));
    await expect(first).resolves.toEqual({ status: 'success', goal });
    expect(publish.mock.calls.filter(([state]) => state.status === 'success')).toHaveLength(1);
  });

  it('maps application and thrown failures to safe retryable form errors', async () => {
    const directionFailure = createGoalFormSubmissionController({
      mode: 'create',
      execute: vi
        .fn()
        .mockResolvedValue(
          failure(new DomainError('goal.direction_not_found', 'Внутреннее сообщение.')),
        ),
    });
    await expect(directionFailure.submit(validDraft())).resolves.toEqual({
      status: 'error',
      message: 'Выбранное направление больше недоступно.',
    });

    const unknownFailure = createGoalFormSubmissionController({
      mode: 'create',
      execute: vi
        .fn()
        .mockResolvedValue(failure(new DomainError('goal.custom', 'Понятная ошибка.'))),
    });
    await expect(unknownFailure.submit(validDraft())).resolves.toEqual({
      status: 'error',
      message: 'Понятная ошибка.',
    });

    const thrown = createGoalFormSubmissionController({
      mode: 'create',
      execute: vi.fn().mockRejectedValue(new Error('IndexedDB stack details')),
    });
    await expect(thrown.submit(validDraft())).resolves.toEqual({
      status: 'error',
      message: 'Не удалось сохранить цель. Попробуйте ещё раз.',
    });
  });

  it('keeps the edit draft intact and maps a version conflict without retrying concurrently', async () => {
    const draft = validDraft();
    const execute = vi
      .fn()
      .mockResolvedValue(failure(new DomainError('goal.version_conflict', 'Internal details')));
    const controller = createGoalFormSubmissionController({ mode: 'edit', execute });

    await expect(controller.submit(draft)).resolves.toEqual({
      status: 'error',
      message: 'Цель уже изменена. Обновите данные и повторите.',
    });
    expect(draft).toEqual(validDraft());
    expect(execute).toHaveBeenCalledOnce();
  });
});
