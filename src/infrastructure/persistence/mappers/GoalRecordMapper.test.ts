import { describe, expect, it } from 'vitest';
import { EntityId, Goal, GOAL_STAGE, GOAL_STATUS } from '../../../domain';
import { GoalRecordMapper } from './GoalRecordMapper';

const CREATED_AT = new Date('2026-08-23T08:00:00.000Z');

describe('GoalRecordMapper', () => {
  it('round-trips a deleted goal with every trash timestamp', () => {
    const deletedAt = new Date('2026-09-25T10:00:00.000Z');
    const goal = Goal.create({
      id: EntityId.create('deleted-goal'),
      title: 'Удалённая цель',
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      now: CREATED_AT,
    }).softDelete(deletedAt);

    const record = GoalRecordMapper.toRecord(goal);
    const restored = GoalRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      deletedAt: deletedAt.toISOString(),
      lastDeletedAt: deletedAt.toISOString(),
      restoredFromTrashAt: null,
    });
    expect(restored.deletedAt).toEqual(deletedAt);
    expect(restored.lastDeletedAt).toEqual(deletedAt);
    expect(restored.restoredFromTrashAt).toBeNull();
  });

  it('round-trips a restored goal and preserves trash history', () => {
    const deletedAt = new Date('2026-09-25T10:00:00.000Z');
    const restoredAt = new Date('2026-09-26T10:00:00.000Z');
    const goal = Goal.create({
      id: EntityId.create('restored-goal'),
      title: 'Восстановленная цель',
      now: CREATED_AT,
    })
      .softDelete(deletedAt)
      .restoreFromTrash(restoredAt);

    const record = GoalRecordMapper.toRecord(goal);
    const restored = GoalRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      deletedAt: null,
      lastDeletedAt: deletedAt.toISOString(),
      restoredFromTrashAt: restoredAt.toISOString(),
    });
    expect(restored.isDeleted()).toBe(false);
    expect(restored.lastDeletedAt).toEqual(deletedAt);
    expect(restored.restoredFromTrashAt).toEqual(restoredAt);
  });

  it('reads legacy goal records without trash timestamps as active', () => {
    const record = GoalRecordMapper.toRecord(
      Goal.create({ id: EntityId.create('legacy-goal'), title: 'Старая цель', now: CREATED_AT }),
    );
    const legacyRecord: Record<string, unknown> = { ...record };
    delete legacyRecord.deletedAt;
    delete legacyRecord.lastDeletedAt;
    delete legacyRecord.restoredFromTrashAt;

    const restored = GoalRecordMapper.fromRecord(legacyRecord);

    expect(restored.isDeleted()).toBe(false);
    expect(restored.deletedAt).toBeNull();
    expect(restored.lastDeletedAt).toBeNull();
    expect(restored.restoredFromTrashAt).toBeNull();
  });
});
