import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { createMemoryEvent, validateMemoryEvent, type MemoryDraft } from './MemoryEvent';
import { validateMemoryPhoto } from './MemoryPhoto';

const draft = (): MemoryDraft => ({
  id: EntityId.create('memory-1'),
  occurredOn: DayDate.create('2024-02-29'),
  title: '  Важный день  ',
  body: '  Запомнить этот момент.  ',
  kind: 'moment',
  isHighlight: false,
  context: null,
  diarySource: null,
  photo: null,
});
const now = new Date('2026-09-29T12:00:00.000Z');

describe('MemoryEvent', () => {
  it('keeps the event date independent of creation time and normalizes personal text', () => {
    const event = createMemoryEvent(draft(), now);
    expect(event.occurredOn.toString()).toBe('2024-02-29');
    expect(event.title).toBe('Важный день');
    expect(event.body).toBe('Запомнить этот момент.');
    expect(event.createdAt).toBe('2026-09-29T12:00:00.000Z');
    expect(event.deletedAt).toBeNull();
    expect(event.version).toBe(0);
  });

  it.each([
    { title: '   ' },
    { title: 'я'.repeat(161) },
    { body: 'я'.repeat(10001) },
    { kind: 'unknown' },
    { isHighlight: 'yes' },
  ])('rejects invalid editable content %j', (invalid) => {
    expect(() => createMemoryEvent({ ...draft(), ...invalid } as MemoryDraft, now)).toThrow();
  });

  it('accepts the text boundaries without requiring a photo or body', () => {
    expect(createMemoryEvent({ ...draft(), title: 'я'.repeat(160), body: '' }, now).body).toBe('');
    expect(createMemoryEvent({ ...draft(), body: 'я'.repeat(10000) }, now).body.length).toBe(10000);
  });

  it('does not reject a stored date because the reader is in an earlier calendar day', () => {
    const event = createMemoryEvent({ ...draft(), occurredOn: DayDate.create('2026-09-30') }, now);
    expect(
      validateMemoryEvent({ ...event, version: 1 }, { persisted: true }).occurredOn.toString(),
    ).toBe('2026-09-30');
  });

  it('rejects malformed persisted versions, chronology and source information', () => {
    const event = createMemoryEvent(draft(), now);
    for (const invalid of [
      { version: 0 },
      { updatedAt: '2020-01-01T00:00:00.000Z' },
      { deletedAt: 'not-a-date' },
      {
        diarySource: {
          entryId: 'diary:day:2026-09-29',
          kind: 'day',
          periodStart: '2026-09-29',
          field: 'mood',
          version: 1,
        },
      },
    ]) {
      expect(() =>
        validateMemoryEvent({ ...event, version: 1, ...invalid }, { persisted: true }),
      ).toThrow();
    }
  });
});

describe('MemoryPhoto', () => {
  it('checks actual base64 bytes rather than trusting the declared file size', () => {
    expect(
      validateMemoryPhoto({
        dataUrl: 'data:image/png;base64,YQ==',
        mimeType: 'image/png',
        sizeBytes: 1,
      }),
    ).toEqual({ dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 });
    for (const invalid of [
      { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/jpeg', sizeBytes: 1 },
      { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 2 },
      { dataUrl: 'data:image/svg+xml;base64,YQ==', mimeType: 'image/svg+xml', sizeBytes: 1 },
      { dataUrl: 'data:image/png;base64,invalid!', mimeType: 'image/png', sizeBytes: 1 },
    ])
      expect(() => validateMemoryPhoto(invalid)).toThrow();
  });
});
