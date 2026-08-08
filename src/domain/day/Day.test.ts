import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { Day } from './Day';
import { DayDate } from './DayDate';
import { DAY_STATUS } from './DayStatus';

const TODAY = DayDate.create('2026-08-01');
const YESTERDAY = DayDate.create('2026-07-31');
const TOMORROW = DayDate.create('2026-08-02');
const CREATED_AT = new Date('2026-08-01T00:05:00.000+09:00');

describe('Day', () => {
  describe('создание', () => {
    it('создаёт будущий запланированный день и событие day.created', () => {
      const day = createPlannedDay();
      const events = day.getUncommittedEvents();

      expect(day.status).toBe(DAY_STATUS.planned);
      expect(day.createdAt).toEqual(CREATED_AT);
      expect(day.plannedAt).toEqual(CREATED_AT);
      expect(day.openedAt).toBeNull();
      expect(day.completedAt).toBeNull();
      expect(day.version).toBe(1);
      expect(events.map((event) => event.eventType)).toEqual(['day.created']);
      expect(events[0]?.occurredAt).toEqual(CREATED_AT);
    });

    it('не позволяет планировать текущую или прошлую дату', () => {
      expect(() => createPlannedDay(TODAY)).toThrowError(
        expect.objectContaining({ code: 'day.planning_requires_future_date' }),
      );
      expect(() => createPlannedDay(YESTERDAY)).toThrow(DomainError);
    });

    it('создаёт текущий день запланированным до явного запуска', () => {
      const day = Day.createCurrentPlanned({
        id: id('current-planned-day'),
        currentDate: TODAY,
        occurredAt: CREATED_AT,
        createdEventId: id('current-planned-created'),
      });

      expect(day.status).toBe(DAY_STATUS.planned);
      expect(day.date.equals(TODAY)).toBe(true);
      expect(day.plannedAt).toEqual(CREATED_AT);
      expect(day.openedAt).toBeNull();
      expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual(['day.created']);
    });

    it('создаёт один текущий открытый день с двумя событиями', () => {
      const day = createOpenDay();

      expect(day.status).toBe(DAY_STATUS.open);
      expect(day.createdAt).toEqual(CREATED_AT);
      expect(day.plannedAt).toBeNull();
      expect(day.openedAt).toEqual(CREATED_AT);
      expect(day.completedAt).toBeNull();
      expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual([
        'day.created',
        'day.opened',
      ]);
    });
  });

  describe('открытие', () => {
    it('переводит наступивший planned-день в open', () => {
      const day = createPlannedDay();
      const openedAt = new Date('2026-08-02T00:01:00.000+09:00');
      day.clearUncommittedEvents();

      day.open(TOMORROW, openedAt, id('opened-event'));

      expect(day.status).toBe(DAY_STATUS.open);
      expect(day.openedAt).toEqual(openedAt);
      expect(day.version).toBe(2);
      expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual(['day.opened']);
    });

    it('не открывает будущий день раньше его даты', () => {
      const day = createPlannedDay();

      expect(() => day.open(TODAY, CREATED_AT, id('opened-event'))).toThrowError(
        expect.objectContaining({ code: 'day.open_too_early' }),
      );
      expect(day.status).toBe(DAY_STATUS.planned);
    });

    it('не открывает завершённый день', () => {
      const day = createOpenDay();
      day.complete(CREATED_AT, id('completed-event'));

      expect(() => day.open(TODAY, CREATED_AT, id('opened-event'))).toThrowError(
        expect.objectContaining({ code: 'day.already_completed' }),
      );
    });

    it('не изменяет уже открытый день и не создаёт повторное событие', () => {
      const day = createOpenDay();
      const originalOpenedAt = day.openedAt;
      day.clearUncommittedEvents();

      day.open(TODAY, new Date('2026-08-01T10:00:00.000+09:00'), id('unused-event'));

      expect(day.openedAt).toEqual(originalOpenedAt);
      expect(day.version).toBe(1);
      expect(day.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('первая содержательная активность', () => {
    it('один раз записывает время и создаёт событие', () => {
      const day = createOpenDay();
      const activityAt = new Date('2026-08-01T09:00:00.000+09:00');
      day.clearUncommittedEvents();

      day.recordFirstActivity(activityAt, id('activity-event'));

      expect(day.firstActivityAt).toEqual(activityAt);
      expect(day.version).toBe(2);
      expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual([
        'day.first_activity_recorded',
      ]);
    });

    it('повторно не меняет время и не создаёт событие', () => {
      const day = createOpenDay();
      const firstActivityAt = new Date('2026-08-01T09:00:00.000+09:00');
      day.clearUncommittedEvents();
      day.recordFirstActivity(firstActivityAt, id('first-activity-event'));

      day.recordFirstActivity(
        new Date('2026-08-01T11:00:00.000+09:00'),
        id('second-activity-event'),
      );

      expect(day.firstActivityAt).toEqual(firstActivityAt);
      expect(day.version).toBe(2);
      expect(day.getUncommittedEvents()).toHaveLength(1);
    });

    it('запрещает активность для запланированного дня', () => {
      const day = createPlannedDay();

      expect(() => day.recordFirstActivity(CREATED_AT, id('activity-event'))).toThrowError(
        expect.objectContaining({ code: 'day.first_activity_requires_open_day' }),
      );
    });

    it('запрещает активность для завершённого дня', () => {
      const day = createOpenDay();
      day.complete(CREATED_AT, id('completed-event'));

      expect(() => day.recordFirstActivity(CREATED_AT, id('activity-event'))).toThrowError(
        expect.objectContaining({ code: 'day.first_activity_requires_open_day' }),
      );
    });
  });

  describe('завершение', () => {
    it('переводит open-день в completed и сохраняет итог', () => {
      const day = createOpenDay();
      const completedAt = new Date('2026-08-01T22:00:00.000+09:00');
      day.clearUncommittedEvents();

      day.complete(completedAt, id('completed-event'), 'Главное выполнено');

      expect(day.status).toBe(DAY_STATUS.completed);
      expect(day.completedAt).toEqual(completedAt);
      expect(day.summary).toBe('Главное выполнено');
      expect(day.version).toBe(2);
      expect(day.getUncommittedEvents().map((event) => event.eventType)).toEqual(['day.completed']);
    });

    it('не позволяет завершить день повторно', () => {
      const day = createOpenDay();
      day.complete(CREATED_AT, id('first-completed-event'));
      const eventCount = day.getUncommittedEvents().length;

      expect(() => day.complete(CREATED_AT, id('second-completed-event'))).toThrowError(
        expect.objectContaining({ code: 'day.completion_requires_open_day' }),
      );
      expect(day.getUncommittedEvents()).toHaveLength(eventCount);
    });

    it('не позволяет завершить запланированный день', () => {
      const day = createPlannedDay();

      expect(() => day.complete(CREATED_AT, id('completed-event'))).toThrowError(
        expect.objectContaining({ code: 'day.completion_requires_open_day' }),
      );
    });
  });

  describe('вычисляемые признаки', () => {
    it('определяет текущий день только по календарной дате', () => {
      const day = createOpenDay();

      expect(day.isCurrent(TODAY)).toBe(true);
      expect(day.isCurrent(TOMORROW)).toBe(false);
    });

    it('помечает прошлый незавершённый день как требующий внимания', () => {
      const day = Day.openCurrent({
        id: id('past-day'),
        currentDate: YESTERDAY,
        occurredAt: CREATED_AT,
        createdEventId: id('past-created'),
        openedEventId: id('past-opened'),
      });

      expect(day.isPastUnfinished(TODAY)).toBe(true);
      expect(day.requiresAttention(TODAY)).toBe(true);
    });

    it('не помечает прошлый завершённый день как требующий внимания', () => {
      const day = Day.openCurrent({
        id: id('past-day'),
        currentDate: YESTERDAY,
        occurredAt: CREATED_AT,
        createdEventId: id('past-created'),
        openedEventId: id('past-opened'),
      });
      day.complete(CREATED_AT, id('past-completed'));

      expect(day.isPastUnfinished(TODAY)).toBe(false);
      expect(day.requiresAttention(TODAY)).toBe(false);
    });

    it('не считает будущий день прошлым незавершённым', () => {
      const day = createPlannedDay();

      expect(day.isPastUnfinished(TODAY)).toBe(false);
      expect(day.requiresAttention(TODAY)).toBe(false);
    });
  });

  it('возвращает снимок событий и позволяет очистить внутренний список', () => {
    const day = createOpenDay();
    const snapshot = [...day.getUncommittedEvents()];
    snapshot.pop();

    expect(snapshot).toHaveLength(1);
    expect(day.getUncommittedEvents()).toHaveLength(2);

    day.clearUncommittedEvents();

    expect(day.getUncommittedEvents()).toHaveLength(0);
  });
});

function createPlannedDay(date: DayDate = TOMORROW): Day {
  return Day.plan({
    id: id('planned-day'),
    date,
    currentDate: TODAY,
    occurredAt: CREATED_AT,
    createdEventId: id('created-event'),
  });
}

function createOpenDay(): Day {
  return Day.openCurrent({
    id: id('open-day'),
    currentDate: TODAY,
    occurredAt: CREATED_AT,
    createdEventId: id('created-event'),
    openedEventId: id('opened-event'),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
