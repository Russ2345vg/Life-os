import { describe, expect, it } from 'vitest';
import { EntityId, LifeAction, LifeActionTitle } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import { selectActionOptions } from './actionSelection';

const rule = (id: string): RecurrenceRule => ({
  id,
  title: 'Практика',
  goalId: null,
  priority: null,
  startDate: '2026-09-21',
  endDate: null,
  maxCompletions: null,
  paused: false,
  pauseUntil: null,
  schedule: { kind: 'daily' },
  revision: 1,
  effectiveFrom: '2026-09-21',
  version: 1,
  schemaVersion: 1,
  updatedAt: '2026-09-21T10:00:00Z',
});
describe('series selection', () => {
  it('selects stable series references for 100 occurrences, preserves ordinary actions and searches once', () => {
    const actions = Array.from({ length: 100 }, (_, i) => {
      const a = LifeAction.createDraft({
        id: EntityId.create(`a${i}`),
        title: LifeActionTitle.create('Практика'),
        createdAt: new Date('2026-09-21T10:00:00Z'),
        eventId: EntityId.create(`e${i}`),
      });
      a.setPlanningMetadata({
        occurrence: { ruleId: 'r1', slot: `slot${i}`, originalDate: '2026-09-21', ruleRevision: 1 },
      });
      return a;
    });
    const ordinary = LifeAction.createDraft({
      id: EntityId.create('ordinary'),
      title: LifeActionTitle.create('Позвонить'),
      createdAt: new Date('2026-09-21T10:00:00Z'),
      eventId: EntityId.create('ordinary-event'),
    });
    const options = selectActionOptions([...actions, ordinary], [rule('r1'), rule('r2')]);
    expect(options.map((o) => o.key).sort()).toEqual(['action:ordinary', 'series:r1', 'series:r2']);
    expect(selectActionOptions(actions, [rule('r1')], 'практика')).toHaveLength(1);
    expect(selectActionOptions([], [rule('r1')])[0]?.selection).toEqual({
      kind: 'series',
      ruleId: 'r1',
    });
    expect(actions).toHaveLength(100);
  });

  it('does not offer a removed series even when historical occurrences remain', () => {
    const historical = LifeAction.createDraft({
      id: EntityId.create('historical'),
      title: LifeActionTitle.create('Удалённая практика'),
      createdAt: new Date('2026-09-21T10:00:00Z'),
      eventId: EntityId.create('historical-event'),
    });
    historical.setPlanningMetadata({
      occurrence: {
        ruleId: 'removed',
        slot: '2026-09-21',
        originalDate: '2026-09-21',
        ruleRevision: 2,
      },
    });
    const removed: RecurrenceRule = {
      ...rule('removed'),
      paused: true,
      removedAt: '2026-09-21T10:00:00Z',
      revision: 2,
    };

    expect(selectActionOptions([historical], [removed])).toEqual([]);
  });
});
