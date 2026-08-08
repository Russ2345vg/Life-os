import { describe, expect, it } from 'vitest';
import { DayDate, DecisionTitle, ExpectedResult } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { createPlannedDecision, decisionId } from '../../test/helpers/DecisionTestFactory';

const DATE = DayDate.create('2026-08-06');
const DELETED_AT = new Date('2026-08-06T20:00:00.000+09:00');
const RESTORED_AT = new Date('2026-08-07T08:00:00.000+09:00');

describe('Decision: мягкое удаление', () => {
  it('перемещает решение в корзину без изменения состояния и плановой даты', () => {
    const decision = createPlannedDecision('soft-delete', DATE);
    decision.clearUncommittedEvents();
    const version = decision.version;

    decision.softDelete(DELETED_AT, decisionId('delete-event'));

    expect(decision.isDeleted()).toBe(true);
    expect(decision.deletedAt).toEqual(DELETED_AT);
    expect(decision.lastDeletedAt).toEqual(DELETED_AT);
    expect(decision.plannedDate).toEqual(DATE);
    expect(decision.status).toBe('planned');
    expect(decision.version).toBe(version + 1);
    expect(decision.getUncommittedEvents()).toHaveLength(1);
    expect(decision.getUncommittedEvents()[0]).toMatchObject({
      eventType: 'decision.deleted',
      eventId: decisionId('delete-event'),
    });
  });

  it('делает решение в корзине неизменяемым', () => {
    const decision = createPlannedDecision('deleted-immutable', DATE);
    decision.softDelete(DELETED_AT, decisionId('delete-event'));

    expect(() =>
      decision.updateDetails({
        title: DecisionTitle.create('Изменённое решение'),
        expectedResult: ExpectedResult.create('Другой результат'),
        occurredAt: RESTORED_AT,
        eventId: decisionId('edit-event'),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'decision.deleted_is_immutable' }),
    );
  });

  it('запрещает повторное удаление', () => {
    const decision = createPlannedDecision('delete-twice', DATE);
    decision.softDelete(DELETED_AT, decisionId('delete-event'));

    expect(() => decision.softDelete(RESTORED_AT, decisionId('second-delete'))).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'decision.already_deleted' }),
    );
  });

  it('восстанавливает исходное решение и сохраняет отметки истории', () => {
    const decision = createPlannedDecision('restore-soft-delete', DATE);
    decision.softDelete(DELETED_AT, decisionId('delete-event'));
    decision.clearUncommittedEvents();
    const version = decision.version;

    decision.restoreFromTrash(RESTORED_AT, decisionId('restore-event'));

    expect(decision.isDeleted()).toBe(false);
    expect(decision.deletedAt).toBeNull();
    expect(decision.lastDeletedAt).toEqual(DELETED_AT);
    expect(decision.restoredFromTrashAt).toEqual(RESTORED_AT);
    expect(decision.plannedDate).toEqual(DATE);
    expect(decision.status).toBe('planned');
    expect(decision.version).toBe(version + 1);
    expect(decision.getUncommittedEvents()[0]).toMatchObject({
      eventType: 'decision.restored_from_trash',
      eventId: decisionId('restore-event'),
    });
  });

  it('запрещает восстановление решения вне корзины', () => {
    const decision = createPlannedDecision('restore-active', DATE);

    expect(() => decision.restoreFromTrash(RESTORED_AT, decisionId('restore-event'))).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: 'decision.restore_requires_deleted' }),
    );
  });
});
