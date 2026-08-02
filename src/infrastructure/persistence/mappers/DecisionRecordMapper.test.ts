import { describe, expect, it } from 'vitest';
import { DayDate } from '../../../domain/day/DayDate';
import {
  ActualResultSummary,
  DECISION_KIND,
  Decision,
  DecisionTitle,
  ExpectedResult,
} from '../../../domain/decision';
import { EntityId } from '../../../domain/shared/EntityId';
import type { DecisionRecord } from '../records/DecisionRecord';
import { DecisionRecordMapper } from './DecisionRecordMapper';

describe('DecisionRecordMapper', () => {
  it('преобразует Decision в независимую plain record без очистки событий', () => {
    const decision = confirmedDecision();
    const eventCount = decision.getUncommittedEvents().length;

    const record = DecisionRecordMapper.toRecord(decision);

    expect(record).toMatchObject({
      schemaVersion: 1,
      id: 'decision-1',
      status: 'confirmed',
      version: 4,
      plannedDate: '2026-08-02',
      createdAt: '2026-08-01T10:00:00.000Z',
      confirmedAt: '2026-08-02T12:00:00.000Z',
      evidenceIds: ['evidence-1'],
    });
    expect(decision.getUncommittedEvents()).toHaveLength(eventCount);

    (record.evidenceIds as string[]).push('record-only');
    expect(decision.evidenceIds.map(String)).toEqual(['evidence-1']);
    expect(DecisionRecordMapper.toRecord(decision).evidenceIds).toEqual(['evidence-1']);
  });

  it('восстанавливает Decision и полный круг сохраняет id, статус, version и даты без событий', () => {
    const source = confirmedDecision();
    const record = DecisionRecordMapper.toRecord(source);
    const restored = DecisionRecordMapper.fromRecord(record);

    expect(restored.id.toString()).toBe(source.id.toString());
    expect(restored.status).toBe(source.status);
    expect(restored.version).toBe(source.version);
    expect(restored.createdAt.toISOString()).toBe(record.createdAt);
    expect(restored.plannedDate?.toString()).toBe(record.plannedDate);
    expect(restored.confirmedAt?.toISOString()).toBe(record.confirmedAt);
    expect(restored.getUncommittedEvents()).toHaveLength(0);
    expect(DecisionRecordMapper.toRecord(restored)).toEqual(record);
  });

  it('отклоняет неподдерживаемую schemaVersion и некорректный EntityId', () => {
    const record = DecisionRecordMapper.toRecord(confirmedDecision());

    expect(() =>
      DecisionRecordMapper.fromRecord({ ...record, schemaVersion: 3 } as unknown as DecisionRecord),
    ).toThrowError(expect.objectContaining({ code: 'persistence.unsupported_schema_version' }));
    expect(() => DecisionRecordMapper.fromRecord({ ...record, id: '' })).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_entity_id' }),
    );
  });

  it('отклоняет повреждённую дату и отсутствие обязательного поля', () => {
    const invalidDate = {
      ...DecisionRecordMapper.toRecord(confirmedDecision()),
      plannedAt: '2026-02-30T10:00:00.000Z',
    };
    const missingTitle = DecisionRecordMapper.toRecord(confirmedDecision());
    delete (missingTitle as { title?: DecisionRecord['title'] }).title;

    expect(() => DecisionRecordMapper.fromRecord(invalidDate)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_date' }),
    );
    expect(() => DecisionRecordMapper.fromRecord(missingTitle)).toThrowError(
      expect.objectContaining({ code: 'persistence.invalid_record' }),
    );
  });
});

function confirmedDecision(): Decision {
  const decision = Decision.createDraft({
    id: id('decision-1'),
    title: DecisionTitle.create('Опубликовать документ'),
    kind: DECISION_KIND.main,
    reason: 'Нужен устойчивый формат',
    expectedResult: ExpectedResult.create('Документ опубликован'),
    occurredAt: time('2026-08-01T10:00:00.000Z'),
    eventId: id('event-draft'),
  });
  decision.plan({
    plannedDate: DayDate.create('2026-08-02'),
    kind: DECISION_KIND.main,
    order: 1,
    occurredAt: time('2026-08-01T11:00:00.000Z'),
    eventId: id('event-planned'),
  });
  decision.markInProgress(time('2026-08-02T09:00:00.000Z'), id('event-started'));
  decision.confirm(
    ActualResultSummary.create('Документ опубликован'),
    [id('evidence-1')],
    time('2026-08-02T12:00:00.000Z'),
    id('event-confirmed'),
  );
  return decision;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(value: string): Date {
  return new Date(value);
}
