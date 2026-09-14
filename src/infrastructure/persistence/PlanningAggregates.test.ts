import { describe, expect, it } from 'vitest';
import { Goal, LifeAction, EntityId, LifeActionTitle } from '../../domain';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
describe('planning aggregate persistence', () => {
  it('retains measurement and a due date independently of horizon', () => {
    const goal = Goal.create({
      id: EntityId.create('g'),
      title: '66 тренировок',
      measurement: {
        mode: 'count',
        target: 66,
        unit: 'раз',
        start: 0,
        direction: 'at_least',
        cycle: null,
      },
      dueDate: '2026-12-31',
      now: new Date(),
    });
    const restored = GoalRecordMapper.fromRecord(GoalRecordMapper.toRecord(goal));
    expect(restored.measurement?.target).toBe(66);
    expect(restored.horizon).toBeNull();
    expect(restored.dueDate).toBe('2026-12-31');
  });
  it('roundtrips occurrence and changes completion identity only after reopen', () => {
    const now = new Date();
    const action = LifeAction.createDraft({
      id: EntityId.create('a'),
      title: LifeActionTitle.create('Тренировка'),
      createdAt: now,
      eventId: EntityId.create('create'),
    });
    action.setPlanningMetadata({
      priority: 'high',
      occurrence: { ruleId: 'r', slot: '2026-09-14', ruleRevision: 1, originalDate: '2026-09-14' },
    });
    const key = action.completionKey;
    action.complete(null, now, EntityId.create('complete'));
    action.complete(null, now, EntityId.create('again'));
    const restored = LifeActionRecordMapper.fromRecord(LifeActionRecordMapper.toRecord(action));
    expect(restored.completionKey).toBe(key);
    expect(restored.occurrence?.ruleId).toBe('r');
    expect(restored.priority).toBe('high');
    restored.reopen(now);
    expect(restored.status).toBe('draft');
    expect(restored.completionKey).not.toBe(key);
  });
});
