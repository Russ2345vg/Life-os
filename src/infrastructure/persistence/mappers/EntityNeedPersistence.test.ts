import type { LifeActionRecord } from '../records/LifeActionRecord';
import { describe, expect, it } from 'vitest';
import { Direction, EntityId, Goal, LifeAction, LifeActionTitle } from '../../../domain';
import { normalizePilotRecord } from '../../sync/pilot/PilotSyncRegistryAdapters';
import { DirectionRecordMapper } from './DirectionRecordMapper';
import { GoalRecordMapper } from './GoalRecordMapper';
import { LifeActionRecordMapper } from './LifeActionRecordMapper';

const now = new Date('2026-09-27T12:00:00Z');
const fixtures = [
  {
    type: 'direction' as const,
    record: DirectionRecordMapper.toRecord(
      Direction.create({
        id: EntityId.create('direction'),
        name: 'Здоровье',
        need: 'Энергия',
        now,
      }),
    ),
    restore: (record: unknown) => DirectionRecordMapper.fromRecord(record).need,
  },
  {
    type: 'goal' as const,
    record: GoalRecordMapper.toRecord(
      Goal.create({ id: EntityId.create('goal'), title: 'Больше сил', need: 'Энергия', now }),
    ),
    restore: (record: unknown) => GoalRecordMapper.fromRecord(record).need,
  },
  {
    type: 'life_action' as const,
    record: LifeActionRecordMapper.toRecord(
      LifeAction.createDraft({
        id: EntityId.create('action'),
        title: LifeActionTitle.create('Прогуляться'),
        need: 'Энергия',
        createdAt: now,
        eventId: EntityId.create('event'),
      }),
    ),
    restore: (record: unknown) =>
      LifeActionRecordMapper.fromRecord(record as LifeActionRecord).need,
  },
];

describe('need persistence and wire compatibility', () => {
  it.each(fixtures)(
    'round trips $type own text, accepts legacy omissions and rejects invalid records',
    ({ type, record, restore }) => {
      expect(restore(record)).toBe('Энергия');
      expect(normalizePilotRecord(type, record).need).toBe('Энергия');
      const legacy = { ...record };
      delete legacy.need;
      expect(restore(legacy)).toBeNull();
      expect(normalizePilotRecord(type, legacy)).not.toHaveProperty('need');
      expect(restore({ ...record, need: '' })).toBeNull();
      expect(() => restore({ ...record, need: 42 })).toThrow();
    },
  );
});
