import { describe, expect, it } from 'vitest';
import { EntityId, WalkCapture } from '../../../domain';
import { WalkCaptureRecordMapper } from './WalkCaptureRecordMapper';

const capture = () =>
  WalkCapture.create({
    id: EntityId.create('c1'),
    walkId: EntityId.create('w1'),
    content: 'Мысль',
    capturedAt: new Date('2026-08-26T08:00:05Z'),
    walkElapsedMs: 5000,
  });

describe('WalkCaptureRecordMapper', () => {
  it('roundtrips pending and processed text without copying Walk context', () => {
    const thought = capture();
    const record = WalkCaptureRecordMapper.toRecord(thought);
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
    expect(WalkCaptureRecordMapper.fromRecord(record)).toEqual(thought);
    const processed = thought.process(new Date('2026-08-26T08:05:00Z'));
    expect(WalkCaptureRecordMapper.fromRecord(WalkCaptureRecordMapper.toRecord(processed))).toEqual(
      processed,
    );
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
    const record = WalkCaptureRecordMapper.toRecord(capture());
    expect(() => WalkCaptureRecordMapper.fromRecord({ ...record, ...patch })).toThrow();
  });
});
