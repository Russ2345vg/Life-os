import { beforeEach, describe, expect, it } from 'vitest';
import * as infrastructure from '../../index';
import { EntityId, WalkCapture } from '../../../domain';

const capture = () =>
  WalkCapture.create({
    id: EntityId.create('c1'),
    walkId: EntityId.create('w1'),
    content: 'Мысль',
    capturedAt: new Date('2026-08-26T08:00:05Z'),
    walkElapsedMs: 5000,
  });

describe('WalkCaptureRecordMapper', () => {
  beforeEach(() => expect(infrastructure).toHaveProperty('WalkCaptureRecordMapper'));

  it('roundtrips pending and processed text without copying Walk context', () => {
    const thought = capture();
    const record = infrastructure.WalkCaptureRecordMapper.toRecord(thought);
    expect(record).toEqual({
      schemaVersion: 1,
      id: 'c1',
      walkId: 'w1',
      type: 'text',
      content: 'Мысль',
      capturedAt: '2026-08-26T08:00:05.000Z',
      createdAt: '2026-08-26T08:00:05.000Z',
      updatedAt: '2026-08-26T08:00:05.000Z',
      walkElapsedMs: 5000,
      status: 'pending',
      version: 1,
    });
    expect(infrastructure.WalkCaptureRecordMapper.fromRecord(record)).toEqual(thought);
    const processed = thought.process(new Date('2026-08-26T08:05:00Z'));
    expect(
      infrastructure.WalkCaptureRecordMapper.fromRecord(
        infrastructure.WalkCaptureRecordMapper.toRecord(processed),
      ),
    ).toEqual(processed);
  });

  it.each([
    { schemaVersion: 2 },
    { type: 'voice' },
    { status: 'removed' },
    { content: '' },
    { capturedAt: 'yesterday' },
    { walkElapsedMs: -10 },
    { version: 0 },
    { walkId: '' },
  ])('rejects malformed persisted data: %j', (patch) => {
    const record = infrastructure.WalkCaptureRecordMapper.toRecord(capture());
    expect(() =>
      infrastructure.WalkCaptureRecordMapper.fromRecord({ ...record, ...patch }),
    ).toThrow();
  });
});
