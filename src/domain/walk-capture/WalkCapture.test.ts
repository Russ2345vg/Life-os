import { beforeEach, describe, expect, it } from 'vitest';
import * as domain from '../index';

const capturedAt = new Date('2026-08-26T08:00:05Z');
const later = new Date('2026-08-26T08:01:00Z');
const input = () => ({
  id: domain.EntityId.create('capture-1'),
  walkId: domain.EntityId.create('walk-1'),
  content: '  Проверить предположение  ',
  capturedAt: new Date(capturedAt),
  walkElapsedMs: 5000,
});

describe('WalkCapture', () => {
  beforeEach(() => expect(domain).toHaveProperty('WalkCapture'));

  it('creates a trimmed pending thought with independent identity and immutable capture metadata', () => {
    const data = input();
    const capture = domain.WalkCapture.create(data);
    data.capturedAt.setFullYear(2000);
    expect(capture).toMatchObject({
      id: domain.EntityId.create('capture-1'),
      walkId: domain.EntityId.create('walk-1'),
      type: 'text',
      content: 'Проверить предположение',
      status: 'pending',
      capturedAt,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      walkElapsedMs: 5000,
      version: 1,
    });
  });

  it.each(['', '   \n\t', 'x'.repeat(501), 'x'.repeat(1000)])(
    'rejects an invalid thought without truncating it',
    (content) => {
      expect(() => domain.WalkCapture.create({ ...input(), content })).toThrowError(
        expect.objectContaining({ code: 'walk_capture.invalid_content' }),
      );
    },
  );

  it('does not expose mutable timestamp references', () => {
    const capture = domain.WalkCapture.create(input());
    capture.capturedAt.setFullYear(2000);
    capture.createdAt.setTime(0);
    capture.updatedAt.setFullYear(1999);
    expect(capture.capturedAt).toEqual(capturedAt);
    expect(capture.createdAt).toEqual(capturedAt);
    expect(capture.updatedAt).toEqual(capturedAt);
    expect(capture.updateContent('Правка', later).capturedAt).toEqual(capturedAt);
  });

  it('accepts the full 500-character boundary and zero elapsed', () => {
    expect(
      domain.WalkCapture.create({ ...input(), content: 'x'.repeat(500), walkElapsedMs: 0 }),
    ).toMatchObject({ content: 'x'.repeat(500), walkElapsedMs: 0 });
  });

  it('edits and processes without changing the original or capture time/link', () => {
    const original = domain.WalkCapture.create(input());
    const edited = original.updateContent('  Уточнённая мысль  ', later);
    const processed = edited.process(later);
    expect(original).toMatchObject({
      content: 'Проверить предположение',
      status: 'pending',
      version: 1,
    });
    expect(edited).toMatchObject({ content: 'Уточнённая мысль', status: 'pending', version: 2 });
    expect(processed).toMatchObject({
      status: 'processed',
      version: 3,
      updatedAt: later,
      createdAt: capturedAt,
      capturedAt,
      walkElapsedMs: 5000,
      walkId: original.walkId,
    });
    expect(processed.process(later)).toBe(processed);
    expect(processed.updateContent('Дополнение', later)).toMatchObject({
      status: 'processed',
      version: 4,
    });
  });

  it('rejects invalid edits and backwards update timestamps', () => {
    const capture = domain.WalkCapture.create(input());
    expect(() => capture.updateContent('  ', later)).toThrowError(
      expect.objectContaining({ code: 'walk_capture.invalid_content' }),
    );
    expect(() => capture.updateContent('Правка', new Date('2026-08-26T08:00:00Z'))).toThrowError();
    expect(() => capture.process(new Date('invalid'))).toThrowError();
  });

  it.each([
    { walkElapsedMs: -1 },
    { walkElapsedMs: 1.5 },
    { walkElapsedMs: Number.NaN },
    { capturedAt: new Date('invalid') },
  ])('rejects invalid creation metadata: %j', (patch) => {
    expect(() => domain.WalkCapture.create({ ...input(), ...patch })).toThrowError();
  });

  it('rehydrates processed captures without normalizing or losing history', () => {
    const data = {
      ...input(),
      content: 'Сохранённый текст',
      type: 'text' as const,
      status: 'processed' as const,
      createdAt: capturedAt,
      updatedAt: later,
      version: 3,
    };
    expect(domain.WalkCapture.rehydrate(data)).toMatchObject(data);
  });

  it.each([
    { type: 'photo' },
    { status: 'unknown' },
    { version: 0 },
    { version: 1.5 },
    { content: ' untrimmed ' },
    { createdAt: new Date('invalid') },
    { createdAt: later },
    { updatedAt: new Date('2026-08-26T08:00:00Z') },
  ])('rejects malformed stored capture: %j', (patch) => {
    const data = {
      ...input(),
      content: 'Текст',
      type: 'text',
      status: 'pending',
      createdAt: capturedAt,
      updatedAt: later,
      version: 1,
      ...patch,
    };
    expect(() =>
      domain.WalkCapture.rehydrate(data as Parameters<typeof domain.WalkCapture.rehydrate>[0]),
    ).toThrowError();
  });
});
