import { describe, expect, it, vi } from 'vitest';
import {
  ActionActualResult,
  ActionCancelReason,
  DayDate,
  EntityId,
  LIFE_ACTION_STATUS,
  LifeActionArchived,
  LifeActionCancelled,
  LifeActionCompleted,
  LifeActionRescheduled,
  LifeActionStarted,
  type LifeAction,
} from '../../domain';
import { InMemoryLifeActionRepository } from '../../infrastructure';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { ArchiveLifeAction } from './ArchiveLifeAction';
import { CancelLifeAction } from './CancelLifeAction';
import { CompleteLifeAction } from './CompleteLifeAction';
import { RescheduleLifeAction } from './RescheduleLifeAction';
import { StartLifeAction } from './StartLifeAction';

const DATE = DayDate.create('2026-08-01');
const NEW_DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-01T12:00:00.000+09:00');

describe('StartLifeAction', () => {
  it('начинает ready с Clock и IdGenerator, создаёт событие, увеличивает версию и сохраняет', async () => {
    const lifeAction = createReadyLifeAction('start-ready', DATE);
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('started-event');
    const version = lifeAction.version;

    const result = await new StartLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: lifeAction.id,
    });
    const updated = unwrap(result);

    expect(updated).toBe(lifeAction);
    expect(updated.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(updated.startedAt).toEqual(NOW);
    expect(updated.version).toBe(version + 1);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(updated);
    const event = onlyEvent(updated);
    expect(event).toBeInstanceOf(LifeActionStarted);
    expect(event.eventId.toString()).toBe('started-event-1');
    expect(event.occurredAt).toEqual(NOW);
  });

  it('возвращает action.not_found без Clock, IdGenerator и сохранения', async () => {
    const repository = new InMemoryLifeActionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new StartLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: EntityId.create('missing'),
    });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('не начинает draft, completed и cancelled и не сохраняет их', async () => {
    const forbidden = [
      createLifeActionDraft('start-draft'),
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('start-completed', DATE))),
      cancelLifeAction(createReadyLifeAction('start-cancelled', DATE)),
    ];

    for (const lifeAction of forbidden) {
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const version = lifeAction.version;
      const startedAt = lifeAction.startedAt;

      const result = await new StartLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('forbidden-start'),
      ).execute({ lifeActionId: lifeAction.id });

      expectFailureCode(result, 'life_action.start_requires_ready');
      expect(lifeAction.version).toBe(version);
      expect(lifeAction.startedAt).toEqual(startedAt);
      expect(lifeAction.getUncommittedEvents()).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('повторно запускает in_progress идемпотентно', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('start-idempotent', DATE));
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('ignored-start');
    const version = lifeAction.version;
    const startedAt = lifeAction.startedAt;

    const updated = unwrap(
      await new StartLifeAction(repository, clock, idGenerator).execute({
        lifeActionId: lifeAction.id,
      }),
    );

    expect(updated).toBe(lifeAction);
    expect(updated.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(updated.startedAt).toEqual(startedAt);
    expect(updated.version).toBe(version);
    expect(updated.getUncommittedEvents()).toEqual([]);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('RescheduleLifeAction', () => {
  it('переносит ready в том же объекте без дубликата, создаёт событие и сохраняет', async () => {
    const lifeAction = createReadyLifeAction('reschedule-ready', DATE);
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('rescheduled-event');
    const version = lifeAction.version;

    const updated = unwrap(
      await new RescheduleLifeAction(repository, clock, idGenerator).execute({
        lifeActionId: lifeAction.id,
        newDate: NEW_DATE,
      }),
    );

    expect(updated).toBe(lifeAction);
    expect(updated.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(updated.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(updated.rescheduleCount).toBe(1);
    expect(updated.version).toBe(version + 1);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    await expect(repository.findByDate(DATE)).resolves.toEqual([]);
    await expect(repository.findByDate(NEW_DATE)).resolves.toEqual([lifeAction]);
    const event = onlyEvent(updated);
    expect(event).toBeInstanceOf(LifeActionRescheduled);
    if (!(event instanceof LifeActionRescheduled)) {
      throw new Error('Ожидалось событие LifeActionRescheduled.');
    }
    expect(event.eventId.toString()).toBe('rescheduled-event-1');
    expect(event.occurredAt).toEqual(NOW);
    expect(event.previousDate.equals(DATE)).toBe(true);
    expect(event.newDate.equals(NEW_DATE)).toBe(true);
    expect(event.rescheduleNumber).toBe(1);
  });

  it('переносит in_progress без смены состояния', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('reschedule-progress', DATE));
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();

    const updated = unwrap(
      await new RescheduleLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('progress-rescheduled'),
      ).execute({ lifeActionId: lifeAction.id, newDate: NEW_DATE }),
    );

    expect(updated.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(updated.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(updated.rescheduleCount).toBe(1);
  });

  it('возвращает action.not_found без использования зависимостей', async () => {
    const repository = new InMemoryLifeActionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new RescheduleLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: EntityId.create('missing'),
      newDate: NEW_DATE,
    });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('не меняет дату, счётчик, версию и события при ошибке переноса', async () => {
    const lifeAction = createReadyLifeAction('reschedule-same-date', DATE);
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const version = lifeAction.version;

    const result = await new RescheduleLifeAction(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('same-date'),
    ).execute({ lifeActionId: lifeAction.id, newDate: DATE });

    expectFailureCode(result, 'life_action.reschedule_same_date');
    expect(lifeAction.plannedDate?.equals(DATE)).toBe(true);
    expect(lifeAction.rescheduleCount).toBe(0);
    expect(lifeAction.version).toBe(version);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('не переносит draft, completed и cancelled', async () => {
    const forbidden = [
      createLifeActionDraft('reschedule-draft'),
      completeLifeAction(
        markLifeActionInProgress(createReadyLifeAction('reschedule-completed', DATE)),
      ),
      cancelLifeAction(createReadyLifeAction('reschedule-cancelled', DATE)),
    ];

    for (const lifeAction of forbidden) {
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const version = lifeAction.version;
      const count = lifeAction.rescheduleCount;

      const result = await new RescheduleLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('forbidden-reschedule'),
      ).execute({ lifeActionId: lifeAction.id, newDate: NEW_DATE });

      expectFailureCode(result, 'life_action.reschedule_not_allowed');
      expect(lifeAction.version).toBe(version);
      expect(lifeAction.rescheduleCount).toBe(count);
      expect(lifeAction.getUncommittedEvents()).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    }
  });
});

describe('CompleteLifeAction', () => {
  it('завершает in_progress, сохраняет фактический результат, событие и новую версию', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('complete-progress', DATE));
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('completed-event');
    const actualResult = ActionActualResult.create('Получен проверенный результат');
    const version = lifeAction.version;

    const updated = unwrap(
      await new CompleteLifeAction(repository, clock, idGenerator).execute({
        lifeActionId: lifeAction.id,
        actualResult,
      }),
    );

    expect(updated.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(updated.actualResult?.equals(actualResult)).toBe(true);
    expect(updated.completedAt).toEqual(NOW);
    expect(updated.version).toBe(version + 1);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
    const event = onlyEvent(updated);
    expect(event).toBeInstanceOf(LifeActionCompleted);
    if (!(event instanceof LifeActionCompleted)) {
      throw new Error('Ожидалось событие LifeActionCompleted.');
    }
    expect(event.eventId.toString()).toBe('completed-event-1');
    expect(event.occurredAt).toEqual(NOW);
    expect(event.actualResult?.equals(actualResult)).toBe(true);
  });

  it('возвращает action.not_found без использования зависимостей', async () => {
    const repository = new InMemoryLifeActionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new CompleteLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: EntityId.create('missing'),
      actualResult: ActionActualResult.create('Результат'),
    });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('не завершает cancelled', async () => {
    const forbidden = [cancelLifeAction(createReadyLifeAction('complete-cancelled', DATE))];

    for (const lifeAction of forbidden) {
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const version = lifeAction.version;

      const result = await new CompleteLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('forbidden-complete'),
      ).execute({
        lifeActionId: lifeAction.id,
        actualResult: ActionActualResult.create('Недопустимый результат'),
      });

      expectFailureCode(result, 'life_action.complete_requires_open');
      expect(lifeAction.version).toBe(version);
      expect(lifeAction.getUncommittedEvents()).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('не оставляет частичный результат при ошибке валидации', async () => {
    const lifeAction = markLifeActionInProgress(createReadyLifeAction('complete-invalid', DATE));
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const version = lifeAction.version;

    const result = await new CompleteLifeAction(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('invalid-complete'),
    ).execute({
      lifeActionId: lifeAction.id,
      actualResult: 'invalid' as unknown as ActionActualResult,
    });

    expectFailureCode(result, 'life_action.actual_result_required');
    expect(lifeAction.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(lifeAction.actualResult).toBeNull();
    expect(lifeAction.completedAt).toBeNull();
    expect(lifeAction.version).toBe(version);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('CancelLifeAction', () => {
  it('отменяет draft, ready и in_progress с причиной, Clock, событием и сохранением', async () => {
    const cancellable = [
      createLifeActionDraft('cancel-draft'),
      createReadyLifeAction('cancel-ready', DATE),
      markLifeActionInProgress(createReadyLifeAction('cancel-progress', DATE)),
    ];

    for (const lifeAction of cancellable) {
      const previousStatus = lifeAction.status;
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const clock = new FakeClock(NOW);
      const now = vi.spyOn(clock, 'now');
      const idGenerator = new FakeIdGenerator(`cancelled-${previousStatus}`);
      const reason = ActionCancelReason.create('Результат больше не нужен');
      const version = lifeAction.version;

      const updated = unwrap(
        await new CancelLifeAction(repository, clock, idGenerator).execute({
          lifeActionId: lifeAction.id,
          reason,
        }),
      );

      expect(updated.status).toBe(LIFE_ACTION_STATUS.cancelled);
      expect(updated.cancelReason?.equals(reason)).toBe(true);
      expect(updated.cancelledAt).toEqual(NOW);
      expect(updated.version).toBe(version + 1);
      expect(now).toHaveBeenCalledOnce();
      expect(idGenerator.generatedCount).toBe(1);
      expect(save).toHaveBeenCalledOnce();
      const event = onlyEvent(updated);
      expect(event).toBeInstanceOf(LifeActionCancelled);
      if (!(event instanceof LifeActionCancelled)) {
        throw new Error('Ожидалось событие LifeActionCancelled.');
      }
      expect(event.eventId.toString()).toBe(`cancelled-${previousStatus}-1`);
      expect(event.occurredAt).toEqual(NOW);
      expect(event.previousStatus).toBe(previousStatus);
      expect(event.reason.equals(reason)).toBe(true);
    }
  });

  it('возвращает action.not_found без использования зависимостей', async () => {
    const repository = new InMemoryLifeActionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new CancelLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: EntityId.create('missing'),
      reason: ActionCancelReason.create('Причина'),
    });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('не отменяет completed или уже cancelled', async () => {
    const forbidden = [
      completeLifeAction(markLifeActionInProgress(createReadyLifeAction('cancel-completed', DATE))),
      cancelLifeAction(createReadyLifeAction('cancel-cancelled', DATE)),
    ];

    for (const lifeAction of forbidden) {
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const version = lifeAction.version;

      const result = await new CancelLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('forbidden-cancel'),
      ).execute({
        lifeActionId: lifeAction.id,
        reason: ActionCancelReason.create('Недопустимая отмена'),
      });

      expectFailureCode(result, 'life_action.cancel_not_allowed');
      expect(lifeAction.version).toBe(version);
      expect(lifeAction.getUncommittedEvents()).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('требует причину и не оставляет частичную отмену', async () => {
    expect(() => ActionCancelReason.create('   ')).toThrowError(
      expect.objectContaining({ code: 'action_cancel_reason.invalid' }),
    );
    const lifeAction = createReadyLifeAction('cancel-no-reason', DATE);
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const version = lifeAction.version;

    const result = await new CancelLifeAction(
      repository,
      new FakeClock(NOW),
      new FakeIdGenerator('invalid-cancel'),
    ).execute({
      lifeActionId: lifeAction.id,
      reason: null as unknown as ActionCancelReason,
    });

    expectFailureCode(result, 'life_action.cancel_reason_required');
    expect(lifeAction.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(lifeAction.cancelledAt).toBeNull();
    expect(lifeAction.cancelReason).toBeNull();
    expect(lifeAction.version).toBe(version);
    expect(lifeAction.getUncommittedEvents()).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('ArchiveLifeAction', () => {
  it('архивирует completed и cancelled, сохраняя основное состояние', async () => {
    const finalActions = [
      completeLifeAction(
        markLifeActionInProgress(createReadyLifeAction('archive-completed', DATE)),
      ),
      cancelLifeAction(createReadyLifeAction('archive-cancelled', DATE)),
    ];

    for (const lifeAction of finalActions) {
      const status = lifeAction.status;
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const clock = new FakeClock(NOW);
      const now = vi.spyOn(clock, 'now');
      const idGenerator = new FakeIdGenerator(`archived-${status}`);
      const version = lifeAction.version;

      const updated = unwrap(
        await new ArchiveLifeAction(repository, clock, idGenerator).execute({
          lifeActionId: lifeAction.id,
        }),
      );

      expect(updated.status).toBe(status);
      expect(updated.archivedAt).toEqual(NOW);
      expect(updated.version).toBe(version + 1);
      expect(now).toHaveBeenCalledOnce();
      expect(idGenerator.generatedCount).toBe(1);
      expect(save).toHaveBeenCalledOnce();
      const event = onlyEvent(updated);
      expect(event).toBeInstanceOf(LifeActionArchived);
      if (!(event instanceof LifeActionArchived)) {
        throw new Error('Ожидалось событие LifeActionArchived.');
      }
      expect(event.eventId.toString()).toBe(`archived-${status}-1`);
      expect(event.occurredAt).toEqual(NOW);
      expect(event.status).toBe(status);
    }
  });

  it('возвращает action.not_found без использования зависимостей', async () => {
    const repository = new InMemoryLifeActionRepository();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('unused');

    const result = await new ArchiveLifeAction(repository, clock, idGenerator).execute({
      lifeActionId: EntityId.create('missing'),
    });

    expectFailureCode(result, 'action.not_found');
    expect(now).not.toHaveBeenCalled();
    expect(idGenerator.generatedCount).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('не архивирует draft, ready и in_progress', async () => {
    const forbidden = [
      createLifeActionDraft('archive-draft'),
      createReadyLifeAction('archive-ready', DATE),
      markLifeActionInProgress(createReadyLifeAction('archive-progress', DATE)),
    ];

    for (const lifeAction of forbidden) {
      const repository = await repositoryWith(lifeAction);
      lifeAction.clearUncommittedEvents();
      const save = vi.spyOn(repository, 'save');
      const version = lifeAction.version;

      const result = await new ArchiveLifeAction(
        repository,
        new FakeClock(NOW),
        new FakeIdGenerator('forbidden-archive'),
      ).execute({ lifeActionId: lifeAction.id });

      expectFailureCode(result, 'life_action.archive_requires_final_status');
      expect(lifeAction.archivedAt).toBeNull();
      expect(lifeAction.version).toBe(version);
      expect(lifeAction.getUncommittedEvents()).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('повторно архивирует идемпотентно без смены состояния, времени, версии и события', async () => {
    const lifeAction = archiveLifeAction(
      completeLifeAction(
        markLifeActionInProgress(createReadyLifeAction('archive-idempotent', DATE)),
      ),
    );
    const repository = await repositoryWith(lifeAction);
    lifeAction.clearUncommittedEvents();
    const save = vi.spyOn(repository, 'save');
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const idGenerator = new FakeIdGenerator('ignored-archive');
    const archivedAt = lifeAction.archivedAt;
    const version = lifeAction.version;

    const updated = unwrap(
      await new ArchiveLifeAction(repository, clock, idGenerator).execute({
        lifeActionId: lifeAction.id,
      }),
    );

    expect(updated.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(updated.archivedAt).toEqual(archivedAt);
    expect(updated.version).toBe(version);
    expect(updated.getUncommittedEvents()).toEqual([]);
    expect(now).toHaveBeenCalledOnce();
    expect(idGenerator.generatedCount).toBe(1);
    expect(save).toHaveBeenCalledOnce();
  });
});

async function repositoryWith(lifeAction: LifeAction): Promise<InMemoryLifeActionRepository> {
  const repository = new InMemoryLifeActionRepository();
  await repository.save(lifeAction);
  return repository;
}

function onlyEvent(lifeAction: LifeAction) {
  const events = lifeAction.getUncommittedEvents();
  expect(events).toHaveLength(1);
  const event = events[0];
  if (event === undefined) {
    throw new Error('Ожидалось одно событие LifeAction.');
  }
  return event;
}

function unwrap(result: Result<LifeAction, DomainError>): LifeAction {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(result: Result<LifeAction, DomainError>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
