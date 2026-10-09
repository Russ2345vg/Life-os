import { describe, expect, it } from 'vitest';
import { EntityId, WalkCapture } from '../../domain';
import { historyWalk } from '../../test/helpers/WalkHistoryFixtures';
import { buildWalkReturnItems } from './GetWalkReturnItems';

const capturedAt = new Date('2026-10-05T10:00:00Z');
function capture(id: string) {
  return WalkCapture.create({
    id: EntityId.create(id),
    walkId: EntityId.create('open'),
    content: `Мысль ${id}`,
    capturedAt,
    walkElapsedMs: 60_000,
  });
}

describe('buildWalkReturnItems', () => {
  it('keeps only open reflection outcomes and unprocessed thoughts', () => {
    const open = historyWalk('open', {
      type: 'reflection',
      intent: 'reflection',
      reflectionTemplate: 'ownQuestion',
      reflectionNotes: { understood: 'Ясно', open: 'Что попробовать?', next: null },
    });
    const next = historyWalk('next', {
      type: 'reflection',
      intent: 'reflection',
      reflectionTemplate: 'ownQuestion',
      reflectionNotes: { understood: null, open: null, next: 'Сделать шаг' },
    });
    const closed = historyWalk('closed', {
      type: 'reflection',
      intent: 'reflection',
      reflectionTemplate: 'ownQuestion',
      reflectionNotes: { understood: 'Ответ найден', open: null, next: null },
    });
    const deleted = historyWalk('deleted', {
      type: 'reflection',
      intent: 'reflection',
      reflectionTemplate: 'ownQuestion',
      reflectionNotes: { understood: null, open: 'Старый вопрос', next: null },
    }).remove(new Date('2026-08-26T09:00:00Z'));
    const pending = capture('pending');
    const processed = capture('processed').process(new Date('2026-10-05T11:00:00Z'));

    const result = buildWalkReturnItems([closed, open, next, deleted], [processed, pending]);
    expect(result.walks.map((walk) => walk.id.toString())).toEqual(['open', 'next']);
    expect(result.captures.map((item) => item.id.toString())).toEqual(['pending']);
  });
});
