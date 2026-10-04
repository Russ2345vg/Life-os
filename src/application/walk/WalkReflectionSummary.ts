import type { Walk } from '../../domain/walk/Walk';

export function formatWalkReflectionSummary(
  walk: Pick<Walk, 'result' | 'reflectionNotes'>,
): string {
  const notes = walk.reflectionNotes;
  return [
    walk.result,
    notes?.understood ? `Что понял: ${notes.understood}` : null,
    notes?.open ? `Что осталось открытым: ${notes.open}` : null,
    notes?.next ? `Что хочу сделать: ${notes.next}` : null,
  ]
    .filter((text): text is string => Boolean(text))
    .join('\n\n');
}
