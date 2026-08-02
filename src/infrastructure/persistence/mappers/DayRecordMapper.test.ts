import { describe, expect, it } from 'vitest';
import { Day } from '../../../domain/day/Day';
import { DayDate } from '../../../domain/day/DayDate';
import { EntityId } from '../../../domain/shared/EntityId';
import type { DayRecord } from '../records/DayRecord';
import { DayRecordMapper } from './DayRecordMapper';

describe('DayRecordMapper', () => {
  it('преобразует Day в независимую plain record без очистки событий', () => {
    const day = completedDay();
    const eventCount = day.getUncommittedEvents().length;

    const record = DayRecordMapper.toRecord(day);

    expect(record).toEqual({
      schemaVersion: 1,
      id: 'day-1',
      date: '2026-08-02',
      status: 'completed',
      createdAt: '2026-08-02T06:00:00.000Z',
      plannedAt: null,
      openedAt: '2026-08-02T06:00:00.000Z',
      firstActivityAt: '2026-08-02T06:15:00.000Z',
      completedAt: '2026-08-02T14:00:00.000Z',
      summary: 'День завершён',
      version: 3,
    });
    expect(day.getUncommittedEvents()).toHaveLength(eventCount);

    const mutableRecord = record as { summary: string | null };
    mutableRecord.summary = 'Изменено только в record';
    expect(day.summary).toBe('День завершён');
    expect(DayRecordMapper.toRecord(day)).not.toBe(record);
  });

  it('восстанавливает Day и полный круг сохраняет id, статус, version и даты без событий', () => {
    const source = completedDay();
    const record = DayRecordMapper.toRecord(source);
    const restored = DayRecordMapper.fromRecord(record);

    expect(restored.id.toString()).toBe(source.id.toString());
    expect(restored.date.toString()).toBe('2026-08-02');
    expect(restored.status).toBe(source.status);
    expect(restored.version).toBe(source.version);
    expect(restored.createdAt.toISOString()).toBe(record.createdAt);
    expect(restored.firstActivityAt?.toISOString()).toBe(record.firstActivityAt);
    expect(restored.completedAt?.toISOString()).toBe(record.completedAt);
    expect(restored.getUncommittedEvents()).toHaveLength(0);
    expect(DayRecordMapper.toRecord(restored)).toEqual(record);
  });

  it('отклоняет неподдерживаемую schemaVersion и некорректный EntityId', () => {
    const record = DayRecordMapper.toRecord(completedDay());

    expect(() =>
      DayRecordMapper.fromRecord({ ...record, schemaVersion: 2 } as unknown as DayRecord),
    ).toThrowError(expect.objectContaining({ code: 'persistence.unsupported_schema_version' }));
    expect(() => DayRecordMapper.fromRecord({ ...record, id: '   ' })).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_entity_id' }),
    );
  });

  it('отклоняет повреждённую дату и отсутствие обязательного поля', () => {
    const invalidDate = { ...DayRecordMapper.toRecord(completedDay()), createdAt: 'not-a-date' };
    const missingStatus = DayRecordMapper.toRecord(completedDay());
    delete (missingStatus as { status?: DayRecord['status'] }).status;

    expect(() => DayRecordMapper.fromRecord(invalidDate)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_date' }),
    );
    expect(() => DayRecordMapper.fromRecord(missingStatus)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});

function completedDay(): Day {
  const day = Day.openCurrent({
    id: id('day-1'),
    currentDate: DayDate.create('2026-08-02'),
    occurredAt: time('06:00'),
    createdEventId: id('event-created'),
    openedEventId: id('event-opened'),
  });
  day.recordFirstActivity(time('06:15'), id('event-activity'));
  day.complete(time('14:00'), id('event-completed'), 'День завершён');
  return day;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(value: string): Date {
  return new Date(`2026-08-02T${value}:00.000Z`);
}
