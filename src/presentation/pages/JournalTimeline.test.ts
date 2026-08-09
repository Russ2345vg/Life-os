import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import type { JournalTimelineItem, JournalTimelineResult } from '../../application';
import { groupJournalItems } from '../journalTimelineFilters';
import { JournalTimelineContent } from './HistoryPage';

describe('Journal timeline presentation', () => {
  it('groups dates newest first and events inside a day chronologically', () => {
    const items = [
      item('second-day', '2026-08-10', '2026-08-10T09:00:00.000+09:00'),
      item('late', '2026-08-09', '2026-08-09T12:00:00.000+09:00'),
      item('early', '2026-08-09', '2026-08-09T08:00:00.000+09:00'),
    ];
    const groups = groupJournalItems(items);
    expect(groups.map((group) => group.date)).toEqual(['2026-08-10', '2026-08-09']);
    expect(groups[1]?.items.map((value) => value.entry.id.toString())).toEqual(['early', 'late']);
  });

  it('renders a missing subject and archived sphere safely without horizontal-only content', () => {
    const data: JournalTimelineResult = {
      startDate: DayDate.create('2026-08-09'),
      endDate: DayDate.create('2026-08-09'),
      items: [
        {
          ...item('missing', '2026-08-09', '2026-08-09T09:05:00.000+09:00'),
          entry: JournalEntry.create({
            id: EntityId.create('missing'),
            type: JOURNAL_ENTRY_TYPE.decisionCreated,
            occurredAt: new Date('2026-08-09T09:05:00.000+09:00'),
            effectiveDate: DayDate.create('2026-08-09'),
            subjectType: JOURNAL_SUBJECT_TYPE.decision,
            subjectId: EntityId.create('missing-decision'),
            sphereId: EntityId.create('missing-sphere'),
            labelAtEvent:
              'Очень длинное название решения, которое должно переноситься на узком экране',
            createdAt: new Date('2026-08-09T09:05:00.000+09:00'),
          }),
        },
      ],
    };

    const markup = renderToStaticMarkup(createElement(JournalTimelineContent, { data }));
    expect(markup).toContain('09:05');
    expect(markup).toContain('Очень длинное название решения');
    expect(markup).toContain('Сфера недоступна');
    expect(markup).toContain('Связанная сущность недоступна');
    expect(markup).not.toContain('<button type="button">«Очень длинное название решения');
  });
});

function item(id: string, date: string, occurredAt: string): JournalTimelineItem {
  return {
    entry: JournalEntry.create({
      id: EntityId.create(id),
      type: JOURNAL_ENTRY_TYPE.dayStarted,
      occurredAt: new Date(occurredAt),
      effectiveDate: DayDate.create(date),
      subjectType: JOURNAL_SUBJECT_TYPE.day,
      createdAt: new Date(occurredAt),
    }),
    sphereName: null,
    decision: null,
    lifeAction: null,
    correctionTarget: null,
    sourceEntry: null,
  };
}
