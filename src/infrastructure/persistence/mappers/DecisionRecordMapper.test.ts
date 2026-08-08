import { describe, expect, it } from 'vitest';
import { DayDate } from '../../../domain/day/DayDate';
import {
  ActualResultSummary,
  DECISION_KIND,
  DECISION_PRIORITY,
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
      sphere: 'Работа',
      price: 'Два часа',
      sacrifices: 'Отложить второстепенное',
      priority: DECISION_PRIORITY.high,
      projectReference: 'LifeOS',
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

  it('восстанавливает старую запись без новых полей с безопасными значениями по умолчанию', () => {
    const record = DecisionRecordMapper.toRecord(confirmedDecision());
    delete (record as { sphere?: string | null }).sphere;
    delete (record as { price?: string | null }).price;
    delete (record as { sacrifices?: string | null }).sacrifices;
    delete (record as { priority?: string }).priority;
    delete (record as { projectReference?: string | null }).projectReference;

    const restored = DecisionRecordMapper.fromRecord(record);

    expect(restored.sphere).toBeNull();
    expect(restored.price).toBeNull();
    expect(restored.sacrifices).toBeNull();
    expect(restored.priority).toBe(DECISION_PRIORITY.normal);
    expect(restored.projectReference).toBeNull();
  });

  it('полным кругом сохраняет мягкое удаление и восстановление без потери прежней даты удаления', () => {
    const decision = createPlannedDecisionForTrash();
    const deletedAt = time('2026-08-02T18:00:00.000Z');
    const restoredAt = time('2026-08-02T18:10:00.000Z');
    decision.softDelete(deletedAt, id('event-deleted'));

    const deletedRecord = DecisionRecordMapper.toRecord(decision);
    const deleted = DecisionRecordMapper.fromRecord(deletedRecord);

    expect(deleted.deletedAt?.toISOString()).toBe(deletedAt.toISOString());
    expect(deleted.lastDeletedAt?.toISOString()).toBe(deletedAt.toISOString());

    deleted.restoreFromTrash(restoredAt, id('event-restored'));
    const restoredRecord = DecisionRecordMapper.toRecord(deleted);
    const restored = DecisionRecordMapper.fromRecord(restoredRecord);

    expect(restored.deletedAt).toBeNull();
    expect(restored.lastDeletedAt?.toISOString()).toBe(deletedAt.toISOString());
    expect(restored.restoredFromTrashAt?.toISOString()).toBe(restoredAt.toISOString());
  });

  it('читает старую запись без полей корзины как активное решение', () => {
    const record = DecisionRecordMapper.toRecord(confirmedDecision());
    delete (record as { deletedAt?: string | null }).deletedAt;
    delete (record as { lastDeletedAt?: string | null }).lastDeletedAt;
    delete (record as { restoredFromTrashAt?: string | null }).restoredFromTrashAt;

    const restored = DecisionRecordMapper.fromRecord(record);

    expect(restored.isDeleted()).toBe(false);
    expect(restored.deletedAt).toBeNull();
    expect(restored.lastDeletedAt).toBeNull();
    expect(restored.restoredFromTrashAt).toBeNull();
  });

  it('полным кругом сохраняет подробную историю переносов', () => {
    const decision = createPlannedDecisionForTrash();
    decision.reschedule(
      DayDate.create('2026-08-04'),
      'Перенос из-за срочного результата',
      time('2026-08-02T12:00:00.000Z'),
      id('event-rescheduled-first'),
    );
    decision.reschedule(
      DayDate.create('2026-08-06'),
      'Нужно завершить связанное действие',
      time('2026-08-04T12:00:00.000Z'),
      id('event-rescheduled-second'),
    );

    const record = DecisionRecordMapper.toRecord(decision);
    const restored = DecisionRecordMapper.fromRecord(record);

    expect(record.rescheduleHistory).toEqual([
      {
        previousPlannedDate: '2026-08-02',
        newPlannedDate: '2026-08-04',
        reason: 'Перенос из-за срочного результата',
        occurredAt: '2026-08-02T12:00:00.000Z',
        sequence: 1,
      },
      {
        previousPlannedDate: '2026-08-04',
        newPlannedDate: '2026-08-06',
        reason: 'Нужно завершить связанное действие',
        occurredAt: '2026-08-04T12:00:00.000Z',
        sequence: 2,
      },
    ]);
    expect(
      restored.rescheduleHistory.map((entry) => ({
        previous: entry.previousPlannedDate.toString(),
        next: entry.newPlannedDate.toString(),
        reason: entry.reason,
        sequence: entry.sequence,
      })),
    ).toEqual([
      {
        previous: '2026-08-02',
        next: '2026-08-04',
        reason: 'Перенос из-за срочного результата',
        sequence: 1,
      },
      {
        previous: '2026-08-04',
        next: '2026-08-06',
        reason: 'Нужно завершить связанное действие',
        sequence: 2,
      },
    ]);
  });

  it('читает старую запись без подробной истории переносов', () => {
    const record = DecisionRecordMapper.toRecord(createPlannedDecisionForTrash());
    const legacy = { ...record, rescheduleCount: 2 };
    delete (legacy as { rescheduleHistory?: DecisionRecord['rescheduleHistory'] })
      .rescheduleHistory;

    const restored = DecisionRecordMapper.fromRecord(legacy);

    expect(restored.rescheduleCount).toBe(2);
    expect(restored.rescheduleHistory).toEqual([]);
  });

  it('отклоняет повреждённую подробную историю переносов', () => {
    const record = DecisionRecordMapper.toRecord(createPlannedDecisionForTrash());

    expect(() =>
      DecisionRecordMapper.fromRecord({
        ...record,
        rescheduleHistory: [{ previousPlannedDate: null }],
      } as unknown as DecisionRecord),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_date' }));
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

function createPlannedDecisionForTrash(): Decision {
  const decision = Decision.createDraft({
    id: id('decision-trash'),
    title: DecisionTitle.create('Решение для корзины'),
    kind: DECISION_KIND.additional,
    occurredAt: time('2026-08-01T10:00:00.000Z'),
    eventId: id('event-trash-draft'),
  });
  decision.plan({
    plannedDate: DayDate.create('2026-08-02'),
    kind: DECISION_KIND.additional,
    occurredAt: time('2026-08-01T11:00:00.000Z'),
    eventId: id('event-trash-planned'),
  });
  return decision;
}

function confirmedDecision(): Decision {
  const decision = Decision.createDraft({
    id: id('decision-1'),
    title: DecisionTitle.create('Опубликовать документ'),
    kind: DECISION_KIND.main,
    reason: 'Нужен устойчивый формат',
    sphere: 'Работа',
    price: 'Два часа',
    sacrifices: 'Отложить второстепенное',
    priority: DECISION_PRIORITY.high,
    projectReference: 'LifeOS',
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
