import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { ActualResultSummary } from './ActualResultSummary';
import { Decision } from './Decision';
import { DecisionCancelReason } from './DecisionCancelReason';
import { DECISION_KIND, type DecisionKind } from './DecisionKind';
import { DECISION_STATUS } from './DecisionStatus';
import { DecisionTitle } from './DecisionTitle';
import { ExpectedResult } from './ExpectedResult';
import { DecisionConfirmed } from './events/DecisionConfirmed';
import { DecisionDetailsUpdated } from './events/DecisionDetailsUpdated';
import { DecisionRescheduled } from './events/DecisionRescheduled';

const YESTERDAY = DayDate.create('2026-07-31');
const TODAY = DayDate.create('2026-08-01');
const TOMORROW = DayDate.create('2026-08-02');
const CREATED_AT = new Date('2026-08-01T08:00:00.000+09:00');
const PLANNED_AT = new Date('2026-08-01T08:15:00.000+09:00');
const STARTED_AT = new Date('2026-08-01T09:00:00.000+09:00');
const CHANGED_AT = new Date('2026-08-01T10:00:00.000+09:00');

describe('Decision', () => {
  describe('черновик', () => {
    it('создаёт валидный draft с начальными полями, версией и событием', () => {
      const decision = createDraft(DECISION_KIND.additional, {
        reason: '  Важно определить направление  ',
        expectedResult: expectedResult(),
      });

      expect(decision.title.toString()).toBe('Подготовить архитектурное решение');
      expect(decision.reason).toBe('Важно определить направление');
      expect(decision.expectedResult?.equals(expectedResult())).toBe(true);
      expect(decision.actualResultSummary).toBeNull();
      expect(decision.status).toBe(DECISION_STATUS.draft);
      expect(decision.kind).toBe(DECISION_KIND.additional);
      expect(decision.plannedDate).toBeNull();
      expect(decision.createdAt).toEqual(CREATED_AT);
      expect(decision.plannedAt).toBeNull();
      expect(decision.version).toBe(1);
      expect(eventTypes(decision)).toEqual(['decision.draft_created']);
    });

    it('защищает время создания от внешней мутации', () => {
      const occurredAt = new Date(CREATED_AT.getTime());
      const decision = createDraft(DECISION_KIND.additional, { occurredAt });
      occurredAt.setFullYear(2030);
      const exposedDate = decision.createdAt;
      exposedDate.setFullYear(2031);

      expect(decision.createdAt).toEqual(CREATED_AT);
    });
  });

  describe('планирование', () => {
    it('переводит дополнительный draft в planned', () => {
      const decision = createDraft();
      decision.clearUncommittedEvents();

      decision.plan({
        plannedDate: TODAY,
        kind: DECISION_KIND.additional,
        occurredAt: PLANNED_AT,
        eventId: id('planned-event'),
      });

      expect(decision.status).toBe(DECISION_STATUS.planned);
      expect(decision.isScheduledFor(TODAY)).toBe(true);
      expect(decision.order).toBeNull();
      expect(decision.plannedAt).toEqual(PLANNED_AT);
      expect(decision.version).toBe(2);
      expect(eventTypes(decision)).toEqual(['decision.planned']);
    });

    it('планирует главное решение только с ExpectedResult и порядком 1–3', () => {
      const decision = createDraft();

      decision.plan({
        plannedDate: TODAY,
        kind: DECISION_KIND.main,
        order: 2,
        expectedResult: expectedResult(),
        occurredAt: PLANNED_AT,
        eventId: id('planned-event'),
      });

      expect(decision.kind).toBe(DECISION_KIND.main);
      expect(decision.order).toBe(2);
      expect(decision.expectedResult?.equals(expectedResult())).toBe(true);
    });

    it('не планирует главное решение без ExpectedResult', () => {
      const decision = createDraft();

      expect(() =>
        decision.plan({
          plannedDate: TODAY,
          kind: DECISION_KIND.main,
          order: 1,
          occurredAt: PLANNED_AT,
          eventId: id('planned-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.main_requires_expected_result' }));
      expect(decision.status).toBe(DECISION_STATUS.draft);
    });

    it.each([0, 4, 1.5])('отклоняет порядок главного решения %s', (order) => {
      const decision = createDraft();

      expect(() =>
        decision.plan({
          plannedDate: TODAY,
          kind: DECISION_KIND.main,
          order,
          expectedResult: expectedResult(),
          occurredAt: PLANNED_AT,
          eventId: id('planned-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.main_invalid_order' }));
    });

    it('требует календарную дату даже при вызове из нетипизированной границы', () => {
      const decision = createDraft();

      expect(() =>
        decision.plan({
          plannedDate: null as unknown as DayDate,
          kind: DECISION_KIND.additional,
          occurredAt: PLANNED_AT,
          eventId: id('planned-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.planned_date_required' }));
    });

    it('запрещает повторное планирование', () => {
      const decision = createPlannedAdditional();

      expect(() =>
        decision.plan({
          plannedDate: TOMORROW,
          kind: DECISION_KIND.additional,
          occurredAt: PLANNED_AT,
          eventId: id('second-planned-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.plan_requires_draft' }));
    });
  });

  describe('начало реализации', () => {
    it('переводит planned в in_progress и создаёт событие', () => {
      const decision = createPlannedAdditional();
      decision.clearUncommittedEvents();

      decision.markInProgress(STARTED_AT, id('started-event'));

      expect(decision.status).toBe(DECISION_STATUS.inProgress);
      expect(decision.startedAt).toEqual(STARTED_AT);
      expect(decision.version).toBe(3);
      expect(eventTypes(decision)).toEqual(['decision.started']);
    });

    it('повторный вызов идемпотентен', () => {
      const decision = createInProgress();
      const originalStartedAt = decision.startedAt;
      const originalVersion = decision.version;
      decision.clearUncommittedEvents();

      decision.markInProgress(CHANGED_AT, id('second-started-event'));

      expect(decision.startedAt).toEqual(originalStartedAt);
      expect(decision.version).toBe(originalVersion);
      expect(eventTypes(decision)).toEqual([]);
    });

    it('запрещает начало реализации из draft', () => {
      expect(() => createDraft().markInProgress(STARTED_AT, id('started-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.start_requires_planned' }),
      );
    });

    it('запрещает начало реализации отменённого решения', () => {
      const decision = createPlannedAdditional();
      decision.cancel(CHANGED_AT, id('cancelled-event'));

      expect(() => decision.markInProgress(STARTED_AT, id('started-event'))).toThrow(DomainError);
    });
  });

  describe('редактирование сведений', () => {
    it('изменяет название и ожидаемый результат planned-решения одним событием', () => {
      const decision = createPlannedMain();
      const plannedDate = decision.plannedDate;
      const order = decision.order;
      const version = decision.version;
      decision.clearUncommittedEvents();

      const changed = decision.updateDetails({
        title: DecisionTitle.create('Обновлённое архитектурное решение'),
        expectedResult: ExpectedResult.create('Обновлённый проверяемый результат'),
        occurredAt: CHANGED_AT,
        eventId: id('details-updated-event'),
      });

      expect(changed).toBe(true);
      expect(decision.title.toString()).toBe('Обновлённое архитектурное решение');
      expect(decision.expectedResult?.toString()).toBe('Обновлённый проверяемый результат');
      expect(decision.status).toBe(DECISION_STATUS.planned);
      expect(decision.plannedDate).toBe(plannedDate);
      expect(decision.order).toBe(order);
      expect(decision.version).toBe(version + 1);
      const event = decision.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(DecisionDetailsUpdated);
      if (!(event instanceof DecisionDetailsUpdated)) {
        throw new Error('Ожидалось событие DecisionDetailsUpdated.');
      }
      expect(event.title.equals(decision.title)).toBe(true);
      expect(event.expectedResult?.equals(decision.expectedResult!)).toBe(true);
      expect(event.occurredAt).toEqual(CHANGED_AT);
    });

    it('разрешает очистить ожидаемый результат дополнительного planned-решения', () => {
      const decision = createPlannedAdditional();
      decision.updateDetails({
        title: decision.title,
        expectedResult: ExpectedResult.create('Временный результат'),
        occurredAt: CHANGED_AT,
        eventId: id('details-added-event'),
      });
      decision.clearUncommittedEvents();

      decision.updateDetails({
        title: decision.title,
        expectedResult: null,
        occurredAt: CHANGED_AT,
        eventId: id('details-cleared-event'),
      });

      expect(decision.expectedResult).toBeNull();
      expect(eventTypes(decision)).toEqual(['decision.details_updated']);
    });

    it('не создаёт событие и версию для одинаковых сведений', () => {
      const decision = createPlannedMain();
      const version = decision.version;
      decision.clearUncommittedEvents();

      const changed = decision.updateDetails({
        title: DecisionTitle.create(decision.title.toString()),
        expectedResult: ExpectedResult.create(decision.expectedResult!.toString()),
        occurredAt: CHANGED_AT,
        eventId: id('unused-event'),
      });

      expect(changed).toBe(false);
      expect(decision.version).toBe(version);
      expect(eventTypes(decision)).toEqual([]);
    });

    it('запрещает редактирование после начала реализации', () => {
      const decision = createInProgress();

      expect(() =>
        decision.updateDetails({
          title: DecisionTitle.create('Недопустимое изменение'),
          expectedResult: null,
          occurredAt: CHANGED_AT,
          eventId: id('details-updated-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.cannot_edit' }));
    });
  });

  describe('перенос', () => {
    it('переносит planned без смены состояния и фиксирует данные события', () => {
      const decision = createPlannedAdditional();
      decision.clearUncommittedEvents();

      decision.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'));

      expect(decision.status).toBe(DECISION_STATUS.planned);
      expect(decision.plannedDate?.equals(TOMORROW)).toBe(true);
      expect(decision.rescheduleCount).toBe(1);
      expect(decision.version).toBe(3);
      const event = decision.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(DecisionRescheduled);
      if (!(event instanceof DecisionRescheduled)) {
        throw new Error('Ожидалось событие DecisionRescheduled.');
      }
      expect(event.previousDate.equals(TODAY)).toBe(true);
      expect(event.newDate.equals(TOMORROW)).toBe(true);
      expect(event.previousPlannedDate.equals(TODAY)).toBe(true);
      expect(event.newPlannedDate.equals(TOMORROW)).toBe(true);
      expect(event.previousOrder).toBeNull();
      expect(event.newOrder).toBeNull();
      expect(event.rescheduleNumber).toBe(1);
    });

    it('переносит главное решение на вычисленную позицию', () => {
      const decision = createPlannedMain();
      decision.clearUncommittedEvents();

      expect(decision.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'), 3)).toBe(true);

      expect(decision.order).toBe(3);
      const event = decision.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(DecisionRescheduled);
      if (!(event instanceof DecisionRescheduled)) {
        throw new Error('Ожидалось событие DecisionRescheduled.');
      }
      expect(event.previousOrder).toBe(1);
      expect(event.newOrder).toBe(3);
    });

    it('переносит in_progress без смены состояния и без создания нового объекта', () => {
      const decision = createInProgress();
      const sameDecision = decision;

      decision.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'));

      expect(decision).toBe(sameDecision);
      expect(decision.status).toBe(DECISION_STATUS.inProgress);
      expect(decision.plannedDate?.equals(TOMORROW)).toBe(true);
    });

    it('идемпотентно принимает перенос на ту же дату', () => {
      const decision = createPlannedAdditional();
      decision.clearUncommittedEvents();
      const version = decision.version;

      expect(decision.reschedule(TODAY, CHANGED_AT, id('rescheduled-event'))).toBe(false);
      expect(decision.version).toBe(version);
      expect(decision.getUncommittedEvents()).toHaveLength(0);
    });

    it('запрещает перенос confirmed', () => {
      const decision = createConfirmed();

      expect(() => decision.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.reschedule_not_allowed' }),
      );
    });

    it('запрещает перенос cancelled', () => {
      const decision = createPlannedAdditional();
      decision.cancel(CHANGED_AT, id('cancelled-event'));

      expect(() => decision.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.reschedule_not_allowed' }),
      );
    });
  });

  describe('подтверждение', () => {
    it('подтверждает in_progress фактическим результатом и evidenceIds', () => {
      const decision = createInProgress();
      const actualResult = ActualResultSummary.create('Документ согласован и опубликован');
      decision.clearUncommittedEvents();

      decision.confirm(
        actualResult,
        [id('evidence-1'), id('evidence-1'), id('evidence-2')],
        CHANGED_AT,
        id('confirmed-event'),
      );

      expect(decision.status).toBe(DECISION_STATUS.confirmed);
      expect(decision.actualResultSummary?.equals(actualResult)).toBe(true);
      expect(decision.confirmedAt).toEqual(CHANGED_AT);
      expect(decision.evidenceIds.map(String)).toEqual(['evidence-1', 'evidence-2']);
      expect(decision.version).toBe(4);
      const event = decision.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(DecisionConfirmed);
      if (!(event instanceof DecisionConfirmed)) {
        throw new Error('Ожидалось событие DecisionConfirmed.');
      }
      expect(event.evidenceIds.map(String)).toEqual(['evidence-1', 'evidence-2']);
    });

    it('не подтверждает без evidenceIds', () => {
      const decision = createInProgress();

      expect(() =>
        decision.confirm(actualResult(), [], CHANGED_AT, id('confirmed-event')),
      ).toThrowError(expect.objectContaining({ code: 'decision.confirm_requires_evidence' }));
    });

    it('не подтверждает без фактического результата', () => {
      const decision = createInProgress();

      expect(() =>
        decision.confirm(
          null as unknown as ActualResultSummary,
          [id('evidence')],
          CHANGED_AT,
          id('confirmed-event'),
        ),
      ).toThrowError(expect.objectContaining({ code: 'decision.confirm_requires_actual_result' }));
    });

    it('подтверждает planned и фиксирует время начала по времени подтверждения', () => {
      const decision = createPlannedAdditional();

      decision.confirm(actualResult(), [id('evidence')], CHANGED_AT, id('confirmed-event'));

      expect(decision.status).toBe(DECISION_STATUS.confirmed);
      expect(decision.startedAt).toEqual(CHANGED_AT);
      expect(decision.confirmedAt).toEqual(CHANGED_AT);
    });

    it('запрещает подтверждение draft', () => {
      expect(() =>
        createDraft().confirm(actualResult(), [id('evidence')], CHANGED_AT, id('confirmed-event')),
      ).toThrowError(expect.objectContaining({ code: 'decision.confirm_not_allowed' }));
    });

    it('запрещает повторное подтверждение', () => {
      const decision = createConfirmed();

      expect(() =>
        decision.confirm(
          actualResult(),
          [id('evidence')],
          CHANGED_AT,
          id('second-confirmed-event'),
        ),
      ).toThrowError(expect.objectContaining({ code: 'decision.confirm_not_allowed' }));
    });
  });

  describe('отмена', () => {
    it('отменяет дополнительный draft без обязательной причины', () => {
      const decision = createDraft();
      decision.clearUncommittedEvents();

      decision.cancel(CHANGED_AT, id('cancelled-event'));

      expect(decision.status).toBe(DECISION_STATUS.cancelled);
      expect(decision.cancelledAt).toEqual(CHANGED_AT);
      expect(decision.cancelReason).toBeNull();
      expect(eventTypes(decision)).toEqual(['decision.cancelled']);
    });

    it('отменяет дополнительное planned без обязательной причины', () => {
      const decision = createPlannedAdditional();

      decision.cancel(CHANGED_AT, id('cancelled-event'));

      expect(decision.status).toBe(DECISION_STATUS.cancelled);
    });

    it('требует причину и отменяет in_progress', () => {
      const decision = createInProgress();

      expect(() => decision.cancel(CHANGED_AT, id('cancelled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.cancel_reason_required' }),
      );

      decision.cancel(
        CHANGED_AT,
        id('cancelled-event'),
        DecisionCancelReason.create('Результат больше не нужен'),
      );
      expect(decision.status).toBe(DECISION_STATUS.cancelled);
      expect(decision.cancelReason?.toString()).toBe('Результат больше не нужен');
    });

    it('требует причину для главного решения в любом отменяемом состоянии', () => {
      const decision = createDraft(DECISION_KIND.main);

      expect(() => decision.cancel(CHANGED_AT, id('cancelled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.cancel_reason_required' }),
      );
    });

    it('запрещает отмену confirmed', () => {
      const decision = createConfirmed();

      expect(() => decision.cancel(CHANGED_AT, id('cancelled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.cancel_not_allowed' }),
      );
    });

    it('запрещает повторную отмену', () => {
      const decision = createDraft();
      decision.cancel(CHANGED_AT, id('cancelled-event'));

      expect(() => decision.cancel(CHANGED_AT, id('second-cancelled-event'))).toThrowError(
        expect.objectContaining({ code: 'decision.cancel_not_allowed' }),
      );
    });
  });

  describe('восстановление', () => {
    it('восстанавливает cancelled в planned и очищает отмену', () => {
      const decision = createPlannedMain();
      decision.cancel(
        CHANGED_AT,
        id('cancelled-event'),
        DecisionCancelReason.create('Изменились условия'),
      );
      const versionBeforeRestore = decision.version;
      decision.clearUncommittedEvents();

      decision.restore({
        plannedDate: TOMORROW,
        occurredAt: CHANGED_AT,
        eventId: id('restored-event'),
      });

      expect(decision.status).toBe(DECISION_STATUS.planned);
      expect(decision.plannedDate?.equals(TOMORROW)).toBe(true);
      expect(decision.cancelledAt).toBeNull();
      expect(decision.cancelReason).toBeNull();
      expect(decision.plannedAt).toEqual(CHANGED_AT);
      expect(decision.startedAt).toBeNull();
      expect(decision.version).toBe(versionBeforeRestore + 1);
      expect(eventTypes(decision)).toEqual(['decision.restored']);
    });

    it('требует ExpectedResult и порядок при восстановлении главного draft', () => {
      const decision = createDraft(DECISION_KIND.main);
      decision.cancel(CHANGED_AT, id('cancelled-event'), DecisionCancelReason.create('Отложено'));

      expect(() =>
        decision.restore({
          plannedDate: TOMORROW,
          occurredAt: CHANGED_AT,
          eventId: id('restored-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.main_requires_expected_result' }));
    });

    it('восстанавливает дополнительный draft без порядка', () => {
      const decision = createDraft();
      decision.cancel(CHANGED_AT, id('cancelled-event'));

      decision.restore({
        plannedDate: TOMORROW,
        occurredAt: CHANGED_AT,
        eventId: id('restored-event'),
      });

      expect(decision.status).toBe(DECISION_STATUS.planned);
      expect(decision.order).toBeNull();
    });

    it('запрещает восстановление неотменённого решения', () => {
      expect(() =>
        createDraft().restore({
          plannedDate: TOMORROW,
          occurredAt: CHANGED_AT,
          eventId: id('restored-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.restore_requires_cancelled' }));
    });
  });

  describe('архивирование', () => {
    it('архивирует confirmed без изменения основного состояния', () => {
      const decision = createConfirmed();
      decision.clearUncommittedEvents();

      decision.archive(CHANGED_AT, id('archived-event'));

      expect(decision.status).toBe(DECISION_STATUS.confirmed);
      expect(decision.archivedAt).toEqual(CHANGED_AT);
      expect(decision.isArchived()).toBe(true);
      expect(eventTypes(decision)).toEqual(['decision.archived']);
    });

    it('архивирует cancelled без изменения основного состояния', () => {
      const decision = createDraft();
      decision.cancel(CHANGED_AT, id('cancelled-event'));

      decision.archive(CHANGED_AT, id('archived-event'));

      expect(decision.status).toBe(DECISION_STATUS.cancelled);
      expect(decision.isArchived()).toBe(true);
    });

    it('повторное архивирование не меняет время, версию и события', () => {
      const decision = createConfirmed();
      decision.archive(CHANGED_AT, id('archived-event'));
      const archivedAt = decision.archivedAt;
      const version = decision.version;
      decision.clearUncommittedEvents();

      decision.archive(new Date('2026-08-02T10:00:00.000+09:00'), id('second-archive-event'));

      expect(decision.archivedAt).toEqual(archivedAt);
      expect(decision.version).toBe(version);
      expect(eventTypes(decision)).toEqual([]);
    });

    it('не архивирует draft, planned или in_progress', () => {
      for (const decision of [createDraft(), createPlannedAdditional(), createInProgress()]) {
        expect(() => decision.archive(CHANGED_AT, id('archived-event'))).toThrowError(
          expect.objectContaining({ code: 'decision.archive_requires_final_status' }),
        );
      }
    });

    it('запрещает обычные изменения архивированного решения', () => {
      const decision = createDraft();
      decision.cancel(CHANGED_AT, id('cancelled-event'));
      decision.archive(CHANGED_AT, id('archived-event'));

      expect(() =>
        decision.restore({
          plannedDate: TOMORROW,
          occurredAt: CHANGED_AT,
          eventId: id('restored-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'decision.archived_is_immutable' }));
    });
  });

  describe('вычисляемые признаки', () => {
    it('определяет решение на переданную дату', () => {
      const decision = createPlannedAdditional(TODAY);

      expect(decision.isScheduledFor(TODAY)).toBe(true);
      expect(decision.isScheduledFor(TOMORROW)).toBe(false);
    });

    it('не считает сегодняшнее и будущее решение просроченным', () => {
      expect(createPlannedAdditional(TODAY).isOverdue(TODAY)).toBe(false);
      expect(createPlannedAdditional(TOMORROW).isOverdue(TODAY)).toBe(false);
    });

    it('считает прошлое planned просроченным и требующим внимания', () => {
      const decision = createPlannedAdditional(YESTERDAY);

      expect(decision.isOverdue(TODAY)).toBe(true);
      expect(decision.requiresAttention(TODAY)).toBe(true);
    });

    it('считает прошлое in_progress просроченным', () => {
      const decision = createPlannedAdditional(YESTERDAY);
      decision.markInProgress(STARTED_AT, id('started-event'));

      expect(decision.isOverdue(TODAY)).toBe(true);
      expect(decision.requiresAttention(TODAY)).toBe(true);
    });

    it('не считает confirmed и cancelled просроченными', () => {
      const confirmed = createConfirmed(YESTERDAY);
      const cancelled = createPlannedAdditional(YESTERDAY);
      cancelled.cancel(CHANGED_AT, id('cancelled-event'));

      expect(confirmed.isOverdue(TODAY)).toBe(false);
      expect(cancelled.isOverdue(TODAY)).toBe(false);
    });

    it('архивированное решение не требует внимания', () => {
      const decision = createConfirmed(YESTERDAY);
      decision.archive(CHANGED_AT, id('archived-event'));

      expect(decision.isOverdue(TODAY)).toBe(false);
      expect(decision.requiresAttention(TODAY)).toBe(false);
    });
  });

  it('возвращает снимок событий и очищает внутренний список', () => {
    const decision = createDraft();
    const snapshot = [...decision.getUncommittedEvents()];
    snapshot.pop();

    expect(snapshot).toHaveLength(0);
    expect(decision.getUncommittedEvents()).toHaveLength(1);

    decision.clearUncommittedEvents();
    expect(decision.getUncommittedEvents()).toHaveLength(0);
  });
});

interface DraftOptions {
  readonly reason?: string;
  readonly expectedResult?: ExpectedResult;
  readonly occurredAt?: Date;
}

function createDraft(
  kind: DecisionKind = DECISION_KIND.additional,
  options: DraftOptions = {},
): Decision {
  return Decision.createDraft({
    id: id('decision-1'),
    title: DecisionTitle.create('Подготовить архитектурное решение'),
    kind,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    ...(options.expectedResult === undefined ? {} : { expectedResult: options.expectedResult }),
    occurredAt: options.occurredAt ?? CREATED_AT,
    eventId: id('draft-created-event'),
  });
}

function createPlannedAdditional(plannedDate: DayDate = TODAY): Decision {
  const decision = createDraft();
  decision.plan({
    plannedDate,
    kind: DECISION_KIND.additional,
    occurredAt: PLANNED_AT,
    eventId: id('planned-event'),
  });
  return decision;
}

function createPlannedMain(plannedDate: DayDate = TODAY): Decision {
  const decision = createDraft(DECISION_KIND.main, { expectedResult: expectedResult() });
  decision.plan({
    plannedDate,
    kind: DECISION_KIND.main,
    order: 1,
    occurredAt: PLANNED_AT,
    eventId: id('planned-event'),
  });
  return decision;
}

function createInProgress(plannedDate: DayDate = TODAY): Decision {
  const decision = createPlannedAdditional(plannedDate);
  decision.markInProgress(STARTED_AT, id('started-event'));
  return decision;
}

function createConfirmed(plannedDate: DayDate = TODAY): Decision {
  const decision = createInProgress(plannedDate);
  decision.confirm(actualResult(), [id('evidence-1')], CHANGED_AT, id('confirmed-event'));
  return decision;
}

function expectedResult(): ExpectedResult {
  return ExpectedResult.create('Опубликован согласованный документ');
}

function actualResult(): ActualResultSummary {
  return ActualResultSummary.create('Документ согласован и опубликован');
}

function eventTypes(decision: Decision): string[] {
  return decision.getUncommittedEvents().map((event) => event.eventType);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
