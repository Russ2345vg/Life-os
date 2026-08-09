import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JournalTimelineItem, JournalTimelineResult } from '../application';
import {
  DayDate,
  EntityId,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  SESSION_COMPLETION_KIND,
  type JournalEntryType,
  type JournalMetadata,
  type JournalSubjectType,
} from '../domain';
import { JournalTimelineContent } from './pages/HistoryPage';
import {
  DEFAULT_JOURNAL_TIMELINE_FILTERS,
  JOURNAL_SPHERE_FILTER,
  JOURNAL_STATE_FILTER,
  JOURNAL_TYPE_FILTER,
  createJournalSphereFilterOptions,
  filterJournalTimelineItems,
  groupJournalItems,
  hasActiveJournalTimelineFilters,
} from './journalTimelineFilters';

const ITEMS = [
  item({
    id: 'created-health',
    type: JOURNAL_ENTRY_TYPE.decisionCreated,
    subjectType: JOURNAL_SUBJECT_TYPE.decision,
    date: '2026-08-08',
    label: 'Ёжедневный план',
    sphereId: 'health',
    sphereName: 'Здоровье',
  }),
  item({
    id: 'cancelled-work',
    type: JOURNAL_ENTRY_TYPE.actionCancelled,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    date: '2026-08-09',
    label: 'Подготовить отчёт',
    sphereId: 'work',
    sphereName: 'Работа',
  }),
  item({
    id: 'interrupted-health',
    type: JOURNAL_ENTRY_TYPE.workSessionCompleted,
    subjectType: JOURNAL_SUBJECT_TYPE.workSession,
    date: '2026-08-09',
    label: 'Ёжедневный план',
    sphereId: 'health',
    sphereName: 'Здоровье',
    metadata: { completionKind: SESSION_COMPLETION_KIND.interrupted },
  }),
  item({
    id: 'day-started',
    type: JOURNAL_ENTRY_TYPE.dayStarted,
    subjectType: JOURNAL_SUBJECT_TYPE.day,
    date: '2026-08-09',
  }),
  item({
    id: 'missing-sphere',
    type: JOURNAL_ENTRY_TYPE.actionCompleted,
    subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
    date: '2026-08-09',
    label: 'Старая задача',
    sphereId: 'archived',
    sphereName: null,
  }),
] as const;

describe('journal timeline filters', () => {
  it('searches the immutable event label without case or ё differences', () => {
    const result = filterJournalTimelineItems(ITEMS, {
      ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
      query: '  ежедневный ПЛАН ',
    });

    expect(result.map((value) => value.entry.id.toString())).toEqual([
      'created-health',
      'interrupted-health',
    ]);
  });

  it('applies date, sphere, type and state simultaneously', () => {
    const result = filterJournalTimelineItems(ITEMS, {
      query: 'план',
      date: '2026-08-09',
      sphere: 'sphere:health',
      type: JOURNAL_TYPE_FILTER.workSession,
      state: JOURNAL_STATE_FILTER.interrupted,
    });

    expect(result.map((value) => value.entry.id.toString())).toEqual(['interrupted-health']);
  });

  it('distinguishes completed, interrupted and cancelled states', () => {
    expect(
      filterJournalTimelineItems(ITEMS, {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        state: JOURNAL_STATE_FILTER.completed,
      }).map((value) => value.entry.id.toString()),
    ).toEqual(['missing-sphere']);
    expect(
      filterJournalTimelineItems(ITEMS, {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        state: JOURNAL_STATE_FILTER.interrupted,
      }).map((value) => value.entry.id.toString()),
    ).toEqual(['interrupted-health']);
    expect(
      filterJournalTimelineItems(ITEMS, {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        state: JOURNAL_STATE_FILTER.cancelled,
      }).map((value) => value.entry.id.toString()),
    ).toEqual(['cancelled-work']);
  });

  it('builds stable sphere options for named, missing and absent spheres', () => {
    expect(createJournalSphereFilterOptions(ITEMS)).toEqual([
      { value: JOURNAL_SPHERE_FILTER.all, label: 'Все сферы' },
      { value: JOURNAL_SPHERE_FILTER.withoutSphere, label: 'Без сферы' },
      { value: 'sphere:health', label: 'Здоровье' },
      { value: 'sphere:work', label: 'Работа' },
      { value: 'sphere:archived', label: 'Сфера недоступна' },
    ]);
  });

  it('recognizes active filters and preserves the source collection', () => {
    const source = [...ITEMS];

    expect(hasActiveJournalTimelineFilters(DEFAULT_JOURNAL_TIMELINE_FILTERS)).toBe(false);
    expect(
      hasActiveJournalTimelineFilters({
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        type: JOURNAL_TYPE_FILTER.decision,
      }),
    ).toBe(true);
    filterJournalTimelineItems(source, {
      ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
      sphere: JOURNAL_SPHERE_FILTER.withoutSphere,
    });
    expect(source).toEqual(ITEMS);
  });

  it('groups filtered events without changing chronological ordering rules', () => {
    const groups = groupJournalItems([ITEMS[1], ITEMS[0], ITEMS[2]]);

    expect(groups.map((group) => group.date)).toEqual(['2026-08-09', '2026-08-08']);
    expect(groups[0]?.items.map((value) => value.entry.id.toString())).toEqual([
      'cancelled-work',
      'interrupted-health',
    ]);
  });

  it('finds corrections by values and reason and filters them by their own type', () => {
    const correction = correctionItem();
    expect(
      filterJournalTimelineItems([correction], {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        query: 'уточнена формулировка',
      }),
    ).toEqual([correction]);
    expect(
      filterJournalTimelineItems([ITEMS[0], correction], {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        type: JOURNAL_TYPE_FILTER.correction,
        state: JOURNAL_STATE_FILTER.corrected,
      }),
    ).toEqual([correction]);
    expect(
      filterJournalTimelineItems([ITEMS[0], correction], {
        ...DEFAULT_JOURNAL_TIMELINE_FILTERS,
        type: JOURNAL_TYPE_FILTER.lifeAction,
      }),
    ).toEqual([]);
  });

  it('renders all five controls and an explicit empty-search state', () => {
    const data: JournalTimelineResult = {
      startDate: DayDate.create('2026-08-08'),
      endDate: DayDate.create('2026-08-09'),
      items: ITEMS,
    };
    const markup = renderToStaticMarkup(
      createElement(JournalTimelineContent, {
        data,
        filters: { ...DEFAULT_JOURNAL_TIMELINE_FILTERS, query: 'нет такого названия' },
      }),
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('type="date"');
    expect(markup).toContain('Название');
    expect(markup).toContain('Сфера');
    expect(markup).toContain('Тип');
    expect(markup).toContain('Состояние');
    expect(markup).toContain('По заданным условиям событий нет');
    expect(markup).toContain('Сбросить фильтры');
  });
});

interface ItemOptions {
  readonly id: string;
  readonly type: JournalEntryType;
  readonly subjectType: JournalSubjectType;
  readonly date: string;
  readonly label?: string;
  readonly sphereId?: string;
  readonly sphereName?: string | null;
  readonly metadata?: JournalMetadata;
}

function item(options: ItemOptions): JournalTimelineItem {
  const occurredAt = new Date(`${options.date}T09:00:00.000+09:00`);
  return {
    entry: JournalEntry.create({
      id: EntityId.create(options.id),
      type: options.type,
      occurredAt,
      effectiveDate: DayDate.create(options.date),
      subjectType: options.subjectType,
      ...(options.label === undefined ? {} : { labelAtEvent: options.label }),
      ...(options.sphereId === undefined ? {} : { sphereId: EntityId.create(options.sphereId) }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      createdAt: occurredAt,
    }),
    sphereName: options.sphereName ?? null,
    decision: null,
    lifeAction: null,
    correctionTarget: null,
    sourceEntry: null,
  };
}

function correctionItem(): JournalTimelineItem {
  const occurredAt = new Date('2026-08-09T12:00:00.000+09:00');
  return {
    entry: JournalEntry.create({
      id: EntityId.create('correction'),
      type: JOURNAL_ENTRY_TYPE.dataCorrected,
      occurredAt,
      effectiveDate: DayDate.create('2026-08-09'),
      subjectType: JOURNAL_SUBJECT_TYPE.lifeAction,
      subjectId: EntityId.create('action'),
      labelAtEvent: 'Старая задача',
      correction: {
        sourceEntryId: EntityId.create('source'),
        previousCorrectionId: null,
        field: JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
        previousValue: 'Старое значение',
        newValue: 'Новое значение',
        reason: 'Уточнена формулировка',
        commandId: EntityId.create('correction'),
      },
      createdAt: occurredAt,
    }),
    sphereName: null,
    decision: null,
    lifeAction: null,
    correctionTarget: null,
    sourceEntry: null,
  };
}
