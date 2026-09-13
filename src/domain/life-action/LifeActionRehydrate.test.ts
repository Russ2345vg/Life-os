import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { ActionActualResult } from './ActionActualResult';
import { ActionCancelReason } from './ActionCancelReason';
import { ActionExpectedResult } from './ActionExpectedResult';
import { LifeAction, type LifeActionRehydrationData } from './LifeAction';
import { LIFE_ACTION_STATUS, type LifeActionStatus } from './LifeActionStatus';
import { LifeActionTitle } from './LifeActionTitle';

describe('LifeAction.rehydrate', () => {
  it('читает V1 без bridge-полей как goalId=null и isNext=false', () => {
    const action = LifeAction.rehydrate(completedData());

    expect(action.goalId).toBeNull();
    expect(action.isNext).toBe(false);
    expect(action.getUncommittedEvents()).toHaveLength(0);
  });

  it('сохраняет bridge-поля без включения правил следующего шага', () => {
    const action = LifeAction.rehydrate({
      ...completedData(),
      goalId: id('goal-1'),
      isNext: true,
    });

    expect(action.goalId?.toString()).toBe('goal-1');
    expect(action.isNext).toBe(true);
    expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(action.version).toBe(7);
    expect(action.getUncommittedEvents()).toHaveLength(0);
  });

  it('восстанавливает существующее состояние и версию без новых событий', () => {
    const action = LifeAction.rehydrate(completedData());

    expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(action.version).toBe(7);
    expect(action.rescheduleCount).toBe(2);
    expect(action.actualResult?.toString()).toBe('Прототип согласован');
    expect(action.getUncommittedEvents()).toHaveLength(0);
  });

  it('восстанавливает необязательную связь с Decision', () => {
    const linked = LifeAction.rehydrate(completedData());
    const unlinked = LifeAction.rehydrate({ ...completedData(), decisionId: null });

    expect(linked.isLinkedToDecision()).toBe(true);
    expect(linked.decisionId?.toString()).toBe('decision-1');
    expect(unlinked.isLinkedToDecision()).toBe(false);
  });

  it('защищает все восстановленные Date от внешней мутации', () => {
    const data = completedData();
    if (data.completedAt === null) {
      throw new Error('Фикстура completed должна содержать completedAt.');
    }
    const originalCreatedAt = new Date(data.createdAt.getTime());
    const originalCompletedAt = new Date(data.completedAt.getTime());
    const action = LifeAction.rehydrate(data);
    data.createdAt.setFullYear(2030);
    data.completedAt?.setFullYear(2031);
    action.readyAt?.setFullYear(2032);
    action.archivedAt?.setFullYear(2033);

    expect(action.createdAt).toEqual(originalCreatedAt);
    expect(action.completedAt).toEqual(originalCompletedAt);
    expect(action.readyAt?.getFullYear()).toBe(2026);
    expect(action.archivedAt?.getFullYear()).toBe(2026);
  });

  it('отклоняет неизвестное состояние', () => {
    expect(() =>
      LifeAction.rehydrate({ ...completedData(), status: 'paused' as LifeActionStatus }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.invalid_status' }));
  });

  it('отклоняет ready без полного набора ожидаемого результата, даты и времени', () => {
    const data = readyData();

    expect(() => LifeAction.rehydrate({ ...data, expectedResult: null })).toThrowError(
      expect.objectContaining({ code: 'life_action.ready_fields_incomplete' }),
    );
    expect(() => LifeAction.rehydrate({ ...data, plannedDate: null })).toThrow(DomainError);
    expect(() => LifeAction.rehydrate({ ...data, readyAt: null })).toThrow(DomainError);
  });

  it('отклоняет in_progress без startedAt', () => {
    expect(() =>
      LifeAction.rehydrate({
        ...readyData(),
        status: LIFE_ACTION_STATUS.inProgress,
        startedAt: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.started_at_required' }));
  });

  it('отклоняет completed без фактического результата или времени завершения', () => {
    expect(() => LifeAction.rehydrate({ ...completedData(), actualResult: null })).toThrowError(
      expect.objectContaining({ code: 'life_action.completed_fields_required' }),
    );
    expect(() => LifeAction.rehydrate({ ...completedData(), completedAt: null })).toThrowError(
      expect.objectContaining({ code: 'life_action.completed_fields_required' }),
    );
  });

  it('отклоняет cancelled без причины или времени отмены', () => {
    expect(() => LifeAction.rehydrate({ ...cancelledData(), cancelReason: null })).toThrowError(
      expect.objectContaining({ code: 'life_action.cancelled_fields_required' }),
    );
    expect(() => LifeAction.rehydrate({ ...cancelledData(), cancelledAt: null })).toThrowError(
      expect.objectContaining({ code: 'life_action.cancelled_fields_required' }),
    );
  });

  it('отклоняет фактический результат у незавершённого действия', () => {
    expect(() =>
      LifeAction.rehydrate({
        ...readyData(),
        actualResult: ActionActualResult.create('Лишний результат'),
        completedAt: new Date('2026-08-01T12:00:00.000+09:00'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.uncompleted_has_result' }));
  });

  it('отклоняет данные отмены у неотменённого действия', () => {
    expect(() =>
      LifeAction.rehydrate({
        ...readyData(),
        cancelledAt: new Date('2026-08-01T12:00:00.000+09:00'),
        cancelReason: ActionCancelReason.create('Лишняя отмена'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.uncancelled_has_cancellation' }));
  });

  it('отклоняет данные подготовки и выполнения у draft', () => {
    expect(() =>
      LifeAction.rehydrate({
        ...readyData(),
        status: LIFE_ACTION_STATUS.draft,
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.draft_has_progress' }));
  });

  it('отклоняет startedAt без полных данных подготовки', () => {
    const data = cancelledData();

    expect(() =>
      LifeAction.rehydrate({
        ...data,
        expectedResult: null,
        plannedDate: null,
        readyAt: null,
        startedAt: new Date('2026-08-01T09:00:00.000+09:00'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.started_without_ready_fields' }));
  });

  it('разрешает cancelled из draft, ready и in_progress', () => {
    const fromDraft = cancelledData();
    const fromReady = {
      ...cancelledData(),
      expectedResult: expectedResult(),
      plannedDate: DayDate.create('2026-08-01'),
      readyAt: new Date('2026-08-01T08:15:00.000+09:00'),
    } satisfies LifeActionRehydrationData;
    const fromProgress = {
      ...fromReady,
      startedAt: new Date('2026-08-01T09:00:00.000+09:00'),
    } satisfies LifeActionRehydrationData;

    expect(LifeAction.rehydrate(fromDraft).status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(LifeAction.rehydrate(fromReady).status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(LifeAction.rehydrate(fromProgress).status).toBe(LIFE_ACTION_STATUS.cancelled);
  });

  it('отклоняет архивирование неокончательного состояния', () => {
    expect(() =>
      LifeAction.rehydrate({
        ...readyData(),
        archivedAt: new Date('2026-08-03T12:00:00.000+09:00'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.invalid_archive_status' }));
  });

  it('отклоняет некорректную версию и счётчик переносов', () => {
    expect(() => LifeAction.rehydrate({ ...completedData(), version: 0 })).toThrow(DomainError);
    expect(() => LifeAction.rehydrate({ ...completedData(), rescheduleCount: -1 })).toThrow(
      DomainError,
    );
  });

  it('отклоняет некорректные временные значения', () => {
    expect(() =>
      LifeAction.rehydrate({ ...completedData(), createdAt: new Date(Number.NaN) }),
    ).toThrowError(expect.objectContaining({ code: 'life_action.invalid_time' }));
  });
});

function completedData(): LifeActionRehydrationData {
  return {
    id: id('action-1'),
    title: LifeActionTitle.create('Подготовить прототип'),
    description: 'Описать ключевые сценарии',
    expectedResult: expectedResult(),
    actualResult: ActionActualResult.create('Прототип согласован'),
    status: LIFE_ACTION_STATUS.completed,
    decisionId: id('decision-1'),
    plannedDate: DayDate.create('2026-08-01'),
    createdAt: new Date('2026-07-31T08:00:00.000+09:00'),
    readyAt: new Date('2026-07-31T09:00:00.000+09:00'),
    startedAt: new Date('2026-08-01T09:00:00.000+09:00'),
    completedAt: new Date('2026-08-01T12:00:00.000+09:00'),
    cancelledAt: null,
    cancelReason: null,
    archivedAt: new Date('2026-08-02T12:00:00.000+09:00'),
    rescheduleCount: 2,
    version: 7,
  };
}

function readyData(): LifeActionRehydrationData {
  return {
    ...completedData(),
    actualResult: null,
    status: LIFE_ACTION_STATUS.ready,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    version: 2,
  };
}

function cancelledData(): LifeActionRehydrationData {
  return {
    ...completedData(),
    expectedResult: null,
    actualResult: null,
    status: LIFE_ACTION_STATUS.cancelled,
    plannedDate: null,
    readyAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: new Date('2026-08-01T10:00:00.000+09:00'),
    cancelReason: ActionCancelReason.create('Результат больше не нужен'),
    archivedAt: null,
    rescheduleCount: 0,
    version: 2,
  };
}

function expectedResult(): ActionExpectedResult {
  return ActionExpectedResult.create('Прототип согласован с владельцем продукта');
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
