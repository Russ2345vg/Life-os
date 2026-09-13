import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { ActionActualResult } from './ActionActualResult';
import { ActionCancelReason } from './ActionCancelReason';
import { ActionExpectedResult } from './ActionExpectedResult';
import { LifeAction } from './LifeAction';
import { LIFE_ACTION_STATUS } from './LifeActionStatus';
import { LifeActionTitle } from './LifeActionTitle';
import { LifeActionCancelled } from './events/LifeActionCancelled';
import { LifeActionCompleted } from './events/LifeActionCompleted';
import { LifeActionDetailsUpdated } from './events/LifeActionDetailsUpdated';
import { LifeActionDraftCreated } from './events/LifeActionDraftCreated';
import { LifeActionReady } from './events/LifeActionReady';
import { LifeActionRescheduled } from './events/LifeActionRescheduled';

const YESTERDAY = DayDate.create('2026-07-31');
const TODAY = DayDate.create('2026-08-01');
const TOMORROW = DayDate.create('2026-08-02');
const CREATED_AT = new Date('2026-08-01T08:00:00.000+09:00');
const READY_AT = new Date('2026-08-01T08:15:00.000+09:00');
const STARTED_AT = new Date('2026-08-01T09:00:00.000+09:00');
const CHANGED_AT = new Date('2026-08-01T10:00:00.000+09:00');
const DECISION_ID = id('decision-1');

describe('LifeAction', () => {
  describe('черновик', () => {
    it('создаёт валидный draft с нормализованным описанием, версией и событием', () => {
      const action = createDraft({ description: '  Описать ключевые сценарии  ' });

      expect(action.title.toString()).toBe('Подготовить прототип');
      expect(action.description).toBe('Описать ключевые сценарии');
      expect(action.expectedResult).toBeNull();
      expect(action.actualResult).toBeNull();
      expect(action.status).toBe(LIFE_ACTION_STATUS.draft);
      expect(action.plannedDate).toBeNull();
      expect(action.createdAt).toEqual(CREATED_AT);
      expect(action.readyAt).toBeNull();
      expect(action.startedAt).toBeNull();
      expect(action.completedAt).toBeNull();
      expect(action.cancelledAt).toBeNull();
      expect(action.archivedAt).toBeNull();
      expect(action.rescheduleCount).toBe(0);
      expect(action.version).toBe(1);
      expect(eventTypes(action)).toEqual(['action.draft_created']);
    });

    it('связывается максимум с одним Decision по идентификатору', () => {
      const action = createDraft({ decisionId: DECISION_ID });
      const event = action.getUncommittedEvents()[0];

      expect(action.isLinkedToDecision()).toBe(true);
      expect(action.decisionId?.equals(DECISION_ID)).toBe(true);
      expect(event).toBeInstanceOf(LifeActionDraftCreated);
      if (!(event instanceof LifeActionDraftCreated)) {
        throw new Error('Ожидалось событие LifeActionDraftCreated.');
      }
      expect(event.decisionId?.equals(DECISION_ID)).toBe(true);
    });

    it('может существовать без Decision и превращает пустое описание в null', () => {
      const action = createDraft({ description: '  ' });

      expect(action.isLinkedToDecision()).toBe(false);
      expect(action.decisionId).toBeNull();
      expect(action.description).toBeNull();
    });

    it('требует LifeActionTitle даже на нетипизированной границе', () => {
      expect(() =>
        LifeAction.createDraft({
          id: id('action-1'),
          title: null as unknown as LifeActionTitle,
          createdAt: CREATED_AT,
          eventId: id('draft-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'life_action.title_required' }));
    });

    it('защищает время создания и время события от внешней мутации', () => {
      const createdAt = new Date(CREATED_AT.getTime());
      const action = createDraft({ createdAt });
      const event = action.getUncommittedEvents()[0];
      createdAt.setFullYear(2030);
      action.createdAt.setFullYear(2031);
      event?.occurredAt.setFullYear(2032);

      expect(action.createdAt).toEqual(CREATED_AT);
      expect(action.getUncommittedEvents()[0]?.occurredAt).toEqual(CREATED_AT);
    });
  });

  describe('подготовка', () => {
    it('переводит draft в ready и сохраняет необходимые данные', () => {
      const action = createDraft();
      action.clearUncommittedEvents();

      action.makeReady({
        expectedResult: expectedResult(),
        plannedDate: TODAY,
        occurredAt: READY_AT,
        eventId: id('ready-event'),
      });

      expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
      expect(action.expectedResult?.equals(expectedResult())).toBe(true);
      expect(action.plannedDate?.equals(TODAY)).toBe(true);
      expect(action.readyAt).toEqual(READY_AT);
      expect(action.version).toBe(2);
      expect(eventTypes(action)).toEqual(['action.ready']);
      const event = action.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(LifeActionReady);
      if (!(event instanceof LifeActionReady)) {
        throw new Error('Ожидалось событие LifeActionReady.');
      }
      expect(event.expectedResult.equals(expectedResult())).toBe(true);
      expect(event.plannedDate.equals(TODAY)).toBe(true);
    });

    it('требует ожидаемый результат и календарную дату', () => {
      const action = createDraft();

      expect(() =>
        action.makeReady({
          expectedResult: null as unknown as ActionExpectedResult,
          plannedDate: TODAY,
          occurredAt: READY_AT,
          eventId: id('ready-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'life_action.expected_result_required' }));
      expect(() =>
        action.makeReady({
          expectedResult: expectedResult(),
          plannedDate: null as unknown as DayDate,
          occurredAt: READY_AT,
          eventId: id('ready-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'life_action.planned_date_required' }));
    });

    it('запрещает повторную подготовку', () => {
      const action = createReady();

      expect(() =>
        action.makeReady({
          expectedResult: expectedResult(),
          plannedDate: TOMORROW,
          occurredAt: CHANGED_AT,
          eventId: id('second-ready-event'),
        }),
      ).toThrowError(expect.objectContaining({ code: 'life_action.make_ready_requires_draft' }));
    });
  });

  describe('изменение сведений', () => {
    it('изменяет только сведения ready-действия и создаёт событие', () => {
      const action = createReady();
      const decisionId = action.decisionId;
      const plannedDate = action.plannedDate;
      const createdAt = action.createdAt;
      const version = action.version;
      action.clearUncommittedEvents();

      const changed = action.updateDetails({
        title: LifeActionTitle.create('  Уточнённое действие  '),
        description: '  Уточнённое описание  ',
        expectedResult: ActionExpectedResult.create('  Уточнённый результат  '),
        occurredAt: CHANGED_AT,
        eventId: id('details-updated-event'),
      });

      expect(changed).toBe(true);
      expect(action.title.toString()).toBe('Уточнённое действие');
      expect(action.description).toBe('Уточнённое описание');
      expect(action.expectedResult?.toString()).toBe('Уточнённый результат');
      expect(action.decisionId).toBe(decisionId);
      expect(action.plannedDate).toBe(plannedDate);
      expect(action.createdAt).toEqual(createdAt);
      expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
      expect(action.version).toBe(version + 1);
      const event = action.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(LifeActionDetailsUpdated);
      expect(event).toMatchObject({ eventType: 'action.details_updated' });
      expect(event?.occurredAt).toEqual(CHANGED_AT);
    });

    it('не меняет версию и события при тех же нормализованных значениях', () => {
      const action = createReady();
      action.clearUncommittedEvents();
      const version = action.version;

      const changed = action.updateDetails({
        title: LifeActionTitle.create(` ${action.title.toString()} `),
        description: action.description,
        expectedResult: ActionExpectedResult.create(` ${action.expectedResult!.toString()} `),
        occurredAt: CHANGED_AT,
        eventId: id('unused-event'),
      });

      expect(changed).toBe(false);
      expect(action.version).toBe(version);
      expect(action.getUncommittedEvents()).toHaveLength(0);
    });

    it('запрещает изменение draft, in_progress, completed, cancelled и archived', () => {
      const inProgress = createInProgress();
      const completed = createCompleted();
      const cancelled = createReady();
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());
      const archived = createCompleted();
      archived.archive(CHANGED_AT, id('archived-event'));

      for (const action of [createDraft(), inProgress, completed, cancelled, archived]) {
        expect(() =>
          action.updateDetails({
            title: LifeActionTitle.create('Другое действие'),
            description: null,
            expectedResult: ActionExpectedResult.create('Другой результат'),
            occurredAt: CHANGED_AT,
            eventId: id('details-updated-event'),
          }),
        ).toThrowError(
          expect.objectContaining({
            code: action.isArchived() ? 'life_action.archived_is_immutable' : 'action.cannot_edit',
          }),
        );
      }
    });
  });

  describe('начало выполнения', () => {
    it('переводит ready в in_progress и создаёт событие', () => {
      const action = createReady();
      action.clearUncommittedEvents();

      action.markInProgress(STARTED_AT, id('started-event'));

      expect(action.status).toBe(LIFE_ACTION_STATUS.inProgress);
      expect(action.startedAt).toEqual(STARTED_AT);
      expect(action.version).toBe(3);
      expect(eventTypes(action)).toEqual(['action.started']);
    });

    it('делает повторный вызов in_progress идемпотентным', () => {
      const action = createInProgress();
      const startedAt = action.startedAt;
      const version = action.version;
      action.clearUncommittedEvents();

      action.markInProgress(CHANGED_AT, id('second-started-event'));

      expect(action.startedAt).toEqual(startedAt);
      expect(action.version).toBe(version);
      expect(eventTypes(action)).toEqual([]);
    });

    it('запрещает начало из draft и cancelled', () => {
      const cancelled = createDraft();
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      expect(() => createDraft().markInProgress(STARTED_AT, id('started-event'))).toThrowError(
        expect.objectContaining({ code: 'life_action.start_requires_ready' }),
      );
      expect(() => cancelled.markInProgress(STARTED_AT, id('started-event'))).toThrow(DomainError);
    });
  });

  describe('перенос', () => {
    it('переносит ready без смены состояния и фиксирует данные события', () => {
      const action = createReady();
      action.clearUncommittedEvents();

      action.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'));

      expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
      expect(action.plannedDate?.equals(TOMORROW)).toBe(true);
      expect(action.rescheduleCount).toBe(1);
      expect(action.version).toBe(3);
      const event = action.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(LifeActionRescheduled);
      if (!(event instanceof LifeActionRescheduled)) {
        throw new Error('Ожидалось событие LifeActionRescheduled.');
      }
      expect(event.previousDate.equals(TODAY)).toBe(true);
      expect(event.newDate.equals(TOMORROW)).toBe(true);
      expect(event.rescheduleNumber).toBe(1);
    });

    it('переносит in_progress в том же объекте и сохраняет состояние', () => {
      const action = createInProgress();
      const sameAction = action;

      action.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'));

      expect(action).toBe(sameAction);
      expect(action.status).toBe(LIFE_ACTION_STATUS.inProgress);
      expect(action.plannedDate?.equals(TOMORROW)).toBe(true);
    });

    it('запрещает перенос на ту же дату', () => {
      expect(() =>
        createReady().reschedule(TODAY, CHANGED_AT, id('rescheduled-event')),
      ).toThrowError(expect.objectContaining({ code: 'life_action.reschedule_same_date' }));
    });

    it('запрещает перенос draft, completed и cancelled', () => {
      const cancelled = createReady();
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      for (const action of [createDraft(), createCompleted(), cancelled]) {
        expect(() => action.reschedule(TOMORROW, CHANGED_AT, id('rescheduled-event'))).toThrowError(
          expect.objectContaining({ code: 'life_action.reschedule_not_allowed' }),
        );
      }
    });
  });

  describe('завершение', () => {
    it('завершает in_progress отдельным фактическим результатом', () => {
      const action = createInProgress();
      const result = actualResult();
      action.clearUncommittedEvents();

      action.complete(result, CHANGED_AT, id('completed-event'));

      expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
      expect(action.actualResult?.equals(result)).toBe(true);
      expect(action.actualResult?.toString()).not.toBe(action.expectedResult?.toString());
      expect(action.completedAt).toEqual(CHANGED_AT);
      expect(action.version).toBe(4);
      const event = action.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(LifeActionCompleted);
      if (!(event instanceof LifeActionCompleted)) {
        throw new Error('Ожидалось событие LifeActionCompleted.');
      }
      expect(event.actualResult?.equals(result)).toBe(true);
    });

    it('отклоняет некорректный тип заметки результата', () => {
      expect(() =>
        createInProgress().complete(
          'invalid' as unknown as ActionActualResult,
          CHANGED_AT,
          id('completed-event'),
        ),
      ).toThrowError(expect.objectContaining({ code: 'life_action.actual_result_required' }));
    });

    it.each([
      ['draft', createDraft],
      ['ready', createReady],
      ['in_progress', createInProgress],
    ] as const)('завершает %s без обязательной заметки', (_status, create) => {
      const action = create();
      const startedAt = action.startedAt;
      action.clearUncommittedEvents();
      action.complete(null, CHANGED_AT, id('simple-completion'));
      expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
      expect(action.actualResult).toBeNull();
      expect(action.completedAt).toEqual(CHANGED_AT);
      expect(action.startedAt).toEqual(startedAt);
      expect(action.getUncommittedEvents()).toHaveLength(1);
    });

    it('запрещает завершение cancelled', () => {
      const cancelled = createInProgress();
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      for (const action of [cancelled]) {
        expect(() =>
          action.complete(actualResult(), CHANGED_AT, id('completed-event')),
        ).toThrowError(expect.objectContaining({ code: 'life_action.complete_requires_open' }));
      }
    });

    it('повторное завершение сохраняет дату, заметку, версию и единственное событие', () => {
      const action = createCompleted();
      const events = action.getUncommittedEvents();
      const version = action.version;
      const result = action.actualResult;
      action.complete(null, new Date('2026-09-13T12:00:00Z'), id('second-completed-event'));
      expect(action.completedAt).toEqual(CHANGED_AT);
      expect(action.actualResult).toBe(result);
      expect(action.version).toBe(version);
      expect(action.getUncommittedEvents()).toEqual(events);
    });
  });

  describe('поздняя связь с целью', () => {
    it('меняет goalId того же completed-действия без изменения факта выполнения', () => {
      const action = createCompleted();
      const before = {
        id: action.id,
        status: action.status,
        completedAt: action.completedAt,
        events: action.getUncommittedEvents(),
      };
      const version = action.version;
      expect(action.setGoal(id('goal-1'))).toBe(true);
      expect(action.goalId?.toString()).toBe('goal-1');
      expect(action.setGoal(id('goal-1'))).toBe(false);
      expect(action.version).toBe(version + 1);
      expect(action.setGoal(null)).toBe(true);
      expect(action.goalId).toBeNull();
      expect(action.version).toBe(version + 2);
      expect({
        id: action.id,
        status: action.status,
        completedAt: action.completedAt,
        events: action.getUncommittedEvents(),
      }).toEqual(before);
    });

    it('сохраняет запрет изменения архивированного действия', () => {
      const action = createCompleted();
      action.archive(CHANGED_AT, id('archived'));
      expect(() => action.setGoal(id('goal-1'))).toThrowError(
        expect.objectContaining({ code: 'life_action.archived_is_immutable' }),
      );
      expect(action.goalId).toBeNull();
    });
  });

  describe('отмена', () => {
    it('отменяет draft с обязательной причиной и создаёт событие', () => {
      const action = createDraft();
      const reason = cancelReason();
      action.clearUncommittedEvents();

      action.cancel(CHANGED_AT, id('cancelled-event'), reason);

      expect(action.status).toBe(LIFE_ACTION_STATUS.cancelled);
      expect(action.cancelledAt).toEqual(CHANGED_AT);
      expect(action.cancelReason?.equals(reason)).toBe(true);
      expect(action.version).toBe(2);
      const event = action.getUncommittedEvents()[0];
      expect(event).toBeInstanceOf(LifeActionCancelled);
      if (!(event instanceof LifeActionCancelled)) {
        throw new Error('Ожидалось событие LifeActionCancelled.');
      }
      expect(event.previousStatus).toBe(LIFE_ACTION_STATUS.draft);
      expect(event.reason.equals(reason)).toBe(true);
    });

    it('отменяет ready и in_progress', () => {
      for (const action of [createReady(), createInProgress()]) {
        action.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());
        expect(action.status).toBe(LIFE_ACTION_STATUS.cancelled);
      }
    });

    it('требует причину при любой отмене', () => {
      expect(() =>
        createDraft().cancel(
          CHANGED_AT,
          id('cancelled-event'),
          null as unknown as ActionCancelReason,
        ),
      ).toThrowError(expect.objectContaining({ code: 'life_action.cancel_reason_required' }));
    });

    it('запрещает отмену completed и повторную отмену', () => {
      const cancelled = createDraft();
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      for (const action of [createCompleted(), cancelled]) {
        expect(() =>
          action.cancel(CHANGED_AT, id('second-cancelled-event'), cancelReason()),
        ).toThrowError(expect.objectContaining({ code: 'life_action.cancel_not_allowed' }));
      }
    });
  });

  describe('архивирование', () => {
    it('архивирует completed и сохраняет основное состояние', () => {
      const action = createCompleted();
      action.clearUncommittedEvents();

      action.archive(CHANGED_AT, id('archived-event'));

      expect(action.status).toBe(LIFE_ACTION_STATUS.completed);
      expect(action.archivedAt).toEqual(CHANGED_AT);
      expect(action.isArchived()).toBe(true);
      expect(eventTypes(action)).toEqual(['action.archived']);
    });

    it('архивирует cancelled и сохраняет основное состояние', () => {
      const action = createDraft();
      action.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      action.archive(CHANGED_AT, id('archived-event'));

      expect(action.status).toBe(LIFE_ACTION_STATUS.cancelled);
      expect(action.isArchived()).toBe(true);
    });

    it('делает повторное архивирование идемпотентным', () => {
      const action = createCompleted();
      action.archive(CHANGED_AT, id('archived-event'));
      const archivedAt = action.archivedAt;
      const version = action.version;
      action.clearUncommittedEvents();

      action.archive(new Date('2026-08-02T10:00:00.000+09:00'), id('second-archive-event'));

      expect(action.archivedAt).toEqual(archivedAt);
      expect(action.version).toBe(version);
      expect(eventTypes(action)).toEqual([]);
    });

    it('не архивирует draft, ready или in_progress', () => {
      for (const action of [createDraft(), createReady(), createInProgress()]) {
        expect(() => action.archive(CHANGED_AT, id('archived-event'))).toThrowError(
          expect.objectContaining({ code: 'life_action.archive_requires_final_status' }),
        );
      }
    });

    it('запрещает обычные изменения архивированного действия', () => {
      const action = createCompleted();
      action.archive(CHANGED_AT, id('archived-event'));

      expect(() =>
        action.complete(actualResult(), CHANGED_AT, id('second-completed-event')),
      ).toThrowError(expect.objectContaining({ code: 'life_action.archived_is_immutable' }));
    });
  });

  describe('вычисляемые признаки', () => {
    it('определяет действие на переданную дату', () => {
      const action = createReady(TODAY);

      expect(action.isScheduledFor(TODAY)).toBe(true);
      expect(action.isScheduledFor(TOMORROW)).toBe(false);
    });

    it('не считает сегодняшнее и будущее действие просроченным', () => {
      expect(createReady(TODAY).isOverdue(TODAY)).toBe(false);
      expect(createReady(TOMORROW).isOverdue(TODAY)).toBe(false);
    });

    it('считает прошлое ready просроченным и требующим внимания', () => {
      const action = createReady(YESTERDAY);

      expect(action.isOverdue(TODAY)).toBe(true);
      expect(action.requiresAttention(TODAY)).toBe(true);
    });

    it('считает прошлое in_progress просроченным', () => {
      const action = createInProgress(YESTERDAY);

      expect(action.isOverdue(TODAY)).toBe(true);
      expect(action.requiresAttention(TODAY)).toBe(true);
    });

    it('не считает completed и cancelled просроченными', () => {
      const completed = createCompleted(YESTERDAY);
      const cancelled = createReady(YESTERDAY);
      cancelled.cancel(CHANGED_AT, id('cancelled-event'), cancelReason());

      expect(completed.isOverdue(TODAY)).toBe(false);
      expect(cancelled.isOverdue(TODAY)).toBe(false);
    });

    it('архивированное действие не требует внимания', () => {
      const action = createCompleted(YESTERDAY);
      action.archive(CHANGED_AT, id('archived-event'));

      expect(action.requiresAttention(TODAY)).toBe(false);
    });
  });

  it('возвращает снимок событий и очищает внутренний список', () => {
    const action = createDraft();
    const snapshot = [...action.getUncommittedEvents()];
    snapshot.pop();

    expect(snapshot).toHaveLength(0);
    expect(action.getUncommittedEvents()).toHaveLength(1);

    action.clearUncommittedEvents();
    expect(action.getUncommittedEvents()).toHaveLength(0);
  });
});

interface DraftOptions {
  readonly description?: string;
  readonly decisionId?: EntityId;
  readonly createdAt?: Date;
}

function createDraft(options: DraftOptions = {}): LifeAction {
  return LifeAction.createDraft({
    id: id('action-1'),
    title: LifeActionTitle.create('Подготовить прототип'),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.decisionId === undefined ? {} : { decisionId: options.decisionId }),
    createdAt: options.createdAt ?? CREATED_AT,
    eventId: id('draft-event'),
  });
}

function createReady(plannedDate: DayDate = TODAY): LifeAction {
  const action = createDraft();
  action.makeReady({
    expectedResult: expectedResult(),
    plannedDate,
    occurredAt: READY_AT,
    eventId: id('ready-event'),
  });
  return action;
}

function createInProgress(plannedDate: DayDate = TODAY): LifeAction {
  const action = createReady(plannedDate);
  action.markInProgress(STARTED_AT, id('started-event'));
  return action;
}

function createCompleted(plannedDate: DayDate = TODAY): LifeAction {
  const action = createInProgress(plannedDate);
  action.complete(actualResult(), CHANGED_AT, id('completed-event'));
  return action;
}

function expectedResult(): ActionExpectedResult {
  return ActionExpectedResult.create('Прототип согласован с владельцем продукта');
}

function actualResult(): ActionActualResult {
  return ActionActualResult.create('Согласованы два ключевых экрана');
}

function cancelReason(): ActionCancelReason {
  return ActionCancelReason.create('Результат больше не нужен');
}

function eventTypes(action: LifeAction): string[] {
  return action.getUncommittedEvents().map((event) => event.eventType);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
