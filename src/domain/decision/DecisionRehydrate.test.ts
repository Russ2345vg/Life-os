import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { ActualResultSummary } from './ActualResultSummary';
import { Decision, type DecisionRehydrationData } from './Decision';
import { DECISION_KIND } from './DecisionKind';
import { DECISION_STATUS, type DecisionStatus } from './DecisionStatus';
import { DecisionTitle } from './DecisionTitle';
import { ExpectedResult } from './ExpectedResult';

describe('Decision.rehydrate', () => {
  it('восстанавливает существующее состояние и версию без новых событий', () => {
    const decision = Decision.rehydrate(confirmedData());

    expect(decision.status).toBe(DECISION_STATUS.confirmed);
    expect(decision.version).toBe(8);
    expect(decision.rescheduleCount).toBe(2);
    expect(decision.actualResultSummary?.toString()).toBe('Документ опубликован');
    expect(decision.evidenceIds.map(String)).toEqual(['evidence-1']);
    expect(decision.getUncommittedEvents()).toHaveLength(0);
  });

  it('устраняет повторяющиеся evidenceIds при восстановлении', () => {
    const data = confirmedData();
    const decision = Decision.rehydrate({
      ...data,
      evidenceIds: [id('evidence-1'), id('evidence-1'), id('evidence-2')],
    });

    expect(decision.evidenceIds.map(String)).toEqual(['evidence-1', 'evidence-2']);
  });

  it('защищает восстановленные Date от внешней мутации', () => {
    const data = confirmedData();
    const originalCreatedAt = new Date(data.createdAt.getTime());
    const decision = Decision.rehydrate(data);
    data.createdAt.setFullYear(2030);
    const exposedPlannedAt = decision.plannedAt;
    exposedPlannedAt?.setFullYear(2031);

    expect(decision.createdAt).toEqual(originalCreatedAt);
    expect(decision.plannedAt?.getFullYear()).toBe(2026);
  });

  it('отклоняет неизвестное состояние', () => {
    const data = confirmedData();

    expect(() => Decision.rehydrate({ ...data, status: 'done' as DecisionStatus })).toThrowError(
      expect.objectContaining({ code: 'decision.invalid_status' }),
    );
  });

  it('отклоняет planned без календарной даты', () => {
    const data = confirmedData();

    expect(() =>
      Decision.rehydrate({
        ...data,
        status: DECISION_STATUS.planned,
        plannedDate: null,
        actualResultSummary: null,
        startedAt: null,
        confirmedAt: null,
        evidenceIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision.scheduled_fields_required' }));
  });

  it('отклоняет главное planned без ожидаемого результата', () => {
    const data = confirmedData();

    expect(() =>
      Decision.rehydrate({
        ...data,
        status: DECISION_STATUS.planned,
        expectedResult: null,
        actualResultSummary: null,
        startedAt: null,
        confirmedAt: null,
        evidenceIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision.main_requires_expected_result' }));
  });

  it('отклоняет confirmed без фактического результата или evidenceIds', () => {
    const data = confirmedData();

    expect(() => Decision.rehydrate({ ...data, actualResultSummary: null })).toThrowError(
      expect.objectContaining({ code: 'decision.confirmed_fields_required' }),
    );
    expect(() => Decision.rehydrate({ ...data, evidenceIds: [] })).toThrowError(
      expect.objectContaining({ code: 'decision.confirmed_fields_required' }),
    );
  });

  it('отклоняет cancelled без времени отмены', () => {
    const data = confirmedData();

    expect(() =>
      Decision.rehydrate({
        ...data,
        status: DECISION_STATUS.cancelled,
        kind: DECISION_KIND.additional,
        actualResultSummary: null,
        confirmedAt: null,
        cancelledAt: null,
        evidenceIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision.cancelled_at_required' }));
  });

  it('требует причину у отменённого ранее выполнявшегося решения', () => {
    const data = confirmedData();

    expect(() =>
      Decision.rehydrate({
        ...data,
        status: DECISION_STATUS.cancelled,
        kind: DECISION_KIND.additional,
        actualResultSummary: null,
        confirmedAt: null,
        cancelledAt: new Date('2026-08-01T11:00:00.000+09:00'),
        cancelReason: null,
        evidenceIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision.cancel_reason_required' }));
  });

  it('отклоняет архивирование неокончательного состояния', () => {
    const data = confirmedData();

    expect(() =>
      Decision.rehydrate({
        ...data,
        status: DECISION_STATUS.planned,
        actualResultSummary: null,
        startedAt: null,
        confirmedAt: null,
        archivedAt: new Date('2026-08-03T12:00:00.000+09:00'),
        evidenceIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision.invalid_archive_status' }));
  });

  it('отклоняет некорректную версию и счётчик переносов', () => {
    const data = confirmedData();

    expect(() => Decision.rehydrate({ ...data, version: 0 })).toThrow(DomainError);
    expect(() => Decision.rehydrate({ ...data, rescheduleCount: -1 })).toThrow(DomainError);
  });
});

function confirmedData(): DecisionRehydrationData {
  return {
    id: id('decision-1'),
    title: DecisionTitle.create('Принять архитектурное решение'),
    reason: 'Нужно определить направление',
    expectedResult: ExpectedResult.create('Согласован документ'),
    actualResultSummary: ActualResultSummary.create('Документ опубликован'),
    status: DECISION_STATUS.confirmed,
    kind: DECISION_KIND.main,
    plannedDate: DayDate.create('2026-08-01'),
    order: 1,
    createdAt: new Date('2026-07-31T08:00:00.000+09:00'),
    plannedAt: new Date('2026-07-31T09:00:00.000+09:00'),
    startedAt: new Date('2026-08-01T09:00:00.000+09:00'),
    confirmedAt: new Date('2026-08-01T12:00:00.000+09:00'),
    cancelledAt: null,
    cancelReason: null,
    archivedAt: null,
    evidenceIds: [id('evidence-1')],
    rescheduleCount: 2,
    version: 8,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
