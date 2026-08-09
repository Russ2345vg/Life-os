import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, WALK_STATUS, WALK_TYPE, Walk } from '../../../domain';
import { WalkRecordMapper } from './WalkRecordMapper';

describe('WalkRecordMapper', () => {
  it('round-trips the minimal stage 14.1 walk record', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-mapper'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.reflection,
      sphereId: EntityId.create('sphere-health'),
      now: new Date('2026-08-08T08:00:00.000Z'),
    });

    const record = WalkRecordMapper.toRecord(walk);
    expect(record).toEqual({
      schemaVersion: 1,
      id: 'walk-mapper',
      date: '2026-08-08',
      type: WALK_TYPE.reflection,
      sphereId: 'sphere-health',
      status: WALK_STATUS.planned,
      mode: null,
      startedAt: null,
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });
    expect(WalkRecordMapper.fromRecord(record)).toMatchObject({
      type: WALK_TYPE.reflection,
      status: WALK_STATUS.planned,
      version: 1,
    });
  });

  it('reads a stage 14.1 record without start fields as planned', () => {
    const restored = WalkRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'walk-stage-14-1',
      date: '2026-08-08',
      type: WALK_TYPE.mindful,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });

    expect(restored).toMatchObject({
      status: WALK_STATUS.planned,
      mode: null,
      startedAt: null,
      reflectionQuestion: null,
      version: 1,
    });
    expect(restored.sphereId).toBeNull();
  });

  it('rejects a persisted unknown walk type', () => {
    expect(() =>
      WalkRecordMapper.fromRecord({
        schemaVersion: 1,
        id: 'walk-invalid',
        date: '2026-08-08',
        type: 'unknown',
        createdAt: '2026-08-08T08:00:00.000Z',
        updatedAt: '2026-08-08T08:00:00.000Z',
        version: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
  });
});
