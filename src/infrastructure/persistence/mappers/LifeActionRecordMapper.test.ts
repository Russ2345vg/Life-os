import { describe, expect, it } from 'vitest';
import { DayDate } from '../../../domain/day/DayDate';
import {
  ActionActualResult,
  ActionExpectedResult,
  LifeAction,
  LifeActionTitle,
} from '../../../domain/life-action';
import { EntityId } from '../../../domain/shared/EntityId';
import type { LifeActionRecord } from '../records/LifeActionRecord';
import { LifeActionRecordMapper } from './LifeActionRecordMapper';

describe('LifeActionRecordMapper', () => {
  it('преобразует LifeAction в независимую plain record без очистки событий', () => {
    const action = completedAction();
    const eventCount = action.getUncommittedEvents().length;

    const record = LifeActionRecordMapper.toRecord(action);

    expect(record).toMatchObject({
      schemaVersion: 1,
      id: 'action-1',
      decisionId: 'decision-1',
      status: 'completed',
      plannedDate: '2026-08-02',
      createdAt: '2026-08-01T10:00:00.000Z',
      completedAt: '2026-08-02T11:00:00.000Z',
      version: 4,
    });
    expect(action.getUncommittedEvents()).toHaveLength(eventCount);

    const mutableRecord = record as { description: string | null };
    mutableRecord.description = 'Изменено только в record';
    expect(action.description).toBe('Проверить полный круг');
    expect(LifeActionRecordMapper.toRecord(action)).not.toBe(record);
  });

  it('восстанавливает LifeAction и полный круг сохраняет id, статус, version и даты без событий', () => {
    const source = completedAction();
    const record = LifeActionRecordMapper.toRecord(source);
    const restored = LifeActionRecordMapper.fromRecord(record);

    expect(restored.id.toString()).toBe(source.id.toString());
    expect(restored.decisionId?.toString()).toBe(source.decisionId?.toString());
    expect(restored.sphereId?.toString()).toBe('sphere-work');
    expect(restored.status).toBe(source.status);
    expect(restored.version).toBe(source.version);
    expect(restored.createdAt.toISOString()).toBe(record.createdAt);
    expect(restored.plannedDate?.toString()).toBe(record.plannedDate);
    expect(restored.completedAt?.toISOString()).toBe(record.completedAt);
    expect(restored.getUncommittedEvents()).toHaveLength(0);
    expect(LifeActionRecordMapper.toRecord(restored)).toEqual(record);
  });

  it('читает старую запись без sphereId как действие без сферы', () => {
    const record = LifeActionRecordMapper.toRecord(completedAction());
    delete (record as { sphereId?: string | null }).sphereId;

    expect(LifeActionRecordMapper.fromRecord(record).sphereId).toBeNull();
  });

  it('отклоняет неподдерживаемую schemaVersion и некорректный EntityId', () => {
    const record = LifeActionRecordMapper.toRecord(completedAction());

    expect(() =>
      LifeActionRecordMapper.fromRecord({
        ...record,
        schemaVersion: 9,
      } as unknown as LifeActionRecord),
    ).toThrowError(expect.objectContaining({ code: 'persistence.unsupported_schema_version' }));
    expect(() => LifeActionRecordMapper.fromRecord({ ...record, decisionId: '  ' })).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_entity_id' }),
    );
  });

  it('отклоняет повреждённую дату и отсутствие обязательного поля', () => {
    const invalidDate = {
      ...LifeActionRecordMapper.toRecord(completedAction()),
      createdAt: '2026-08-02T12:00:00+06:00',
    };
    const missingVersion = LifeActionRecordMapper.toRecord(completedAction());
    delete (missingVersion as { version?: LifeActionRecord['version'] }).version;

    expect(() => LifeActionRecordMapper.fromRecord(invalidDate)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_date' }),
    );
    expect(() => LifeActionRecordMapper.fromRecord(missingVersion)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});

function completedAction(): LifeAction {
  const action = LifeAction.createDraft({
    id: id('action-1'),
    title: LifeActionTitle.create('Проверить persistence'),
    description: 'Проверить полный круг',
    decisionId: id('decision-1'),
    sphereId: id('sphere-work'),
    createdAt: time('2026-08-01T10:00:00.000Z'),
    eventId: id('event-draft'),
  });
  action.makeReady({
    expectedResult: ActionExpectedResult.create('Все поля сохраняются'),
    plannedDate: DayDate.create('2026-08-02'),
    occurredAt: time('2026-08-01T11:00:00.000Z'),
    eventId: id('event-ready'),
  });
  action.markInProgress(time('2026-08-02T09:00:00.000Z'), id('event-started'));
  action.complete(
    ActionActualResult.create('Все поля сохранены'),
    time('2026-08-02T11:00:00.000Z'),
    id('event-completed'),
  );
  return action;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(value: string): Date {
  return new Date(value);
}
