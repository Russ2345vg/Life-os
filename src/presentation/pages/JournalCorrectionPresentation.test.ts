import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JournalTimelineItem, JournalTimelineResult } from '../../application';
import {
  DayDate,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import { JournalCorrectionDialog, JournalTimelineContent } from './HistoryPage';

const DATE = DayDate.create('2026-08-09');
const OCCURRED_AT = new Date('2026-08-09T12:00:00.000+09:00');

describe('Journal correction presentation', () => {
  it('renders the entity, field, previous value, required inputs and explicit confirmation', () => {
    const markup = renderToStaticMarkup(
      createElement(JournalCorrectionDialog, {
        item: originalItem(),
        correctJournalData: { execute: async () => Promise.reject(new Error('not called')) },
        idGenerator: { generate: () => EntityId.create('command') },
        onClose: () => undefined,
        onSaved: () => undefined,
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Действие для проверки');
    expect(markup).toContain('Фактический результат действия');
    expect(markup).toContain('Прежний результат');
    expect(markup).toContain('Новое значение');
    expect(markup).toContain('Причина исправления');
    expect(markup).toContain(
      'Исходная запись останется в истории. Исправление будет добавлено как новое событие.',
    );
    expect(markup).toMatch(/disabled=""[^>]*>Сохранить исправление/);
  });

  it('renders correction values, reason and a safe missing-source signature', () => {
    const data: JournalTimelineResult = {
      startDate: DATE,
      endDate: DATE,
      items: [correctionItem()],
    };
    const markup = renderToStaticMarkup(createElement(JournalTimelineContent, { data }));

    expect(markup).toContain('Исправление данных');
    expect(markup).toContain('Прежний результат');
    expect(markup).toContain('Исправленный результат');
    expect(markup).toContain('Проверена исходная запись');
    expect(markup).toContain('Исходное событие недоступно, историческая запись сохранена.');
    expect(markup).not.toContain('Удалить исправление');
  });
});

function originalItem(): JournalTimelineItem {
  return {
    entry: JournalEntry.create({
      id: EntityId.create('source'),
      type: JOURNAL_ENTRY_TYPE.actionCompleted,
      occurredAt: OCCURRED_AT,
      effectiveDate: DATE,
      subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
      subjectId: EntityId.create('action'),
      labelAtEvent: 'Действие для проверки',
      metadata: { actualResult: 'Прежний результат' },
      createdAt: OCCURRED_AT,
    }),
    sphereName: null,
    decision: null,
    lifeAction: null,
    correctionTarget: {
      field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      fieldLabel: 'Фактический результат действия',
      entityLabel: 'Действие для проверки',
      currentValue: 'Прежний результат',
    },
    sourceEntry: null,
  };
}

function correctionItem(): JournalTimelineItem {
  return {
    entry: JournalEntry.create({
      id: EntityId.create('correction'),
      type: JOURNAL_ENTRY_TYPE.dataCorrected,
      occurredAt: OCCURRED_AT,
      effectiveDate: DATE,
      subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
      subjectId: EntityId.create('action'),
      labelAtEvent: 'Действие для проверки',
      correction: {
        sourceEntryId: EntityId.create('source'),
        previousCorrectionId: null,
        field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
        previousValue: 'Прежний результат',
        newValue: 'Исправленный результат',
        reason: 'Проверена исходная запись',
        commandId: EntityId.create('correction'),
      },
      createdAt: OCCURRED_AT,
    }),
    sphereName: null,
    decision: null,
    lifeAction: null,
    correctionTarget: null,
    sourceEntry: null,
  };
}
