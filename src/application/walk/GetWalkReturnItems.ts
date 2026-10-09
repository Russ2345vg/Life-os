import type { Walk } from '../../domain/walk/Walk';
import type { WalkCapture } from '../../domain/walk-capture/WalkCapture';

export function buildWalkReturnItems(
  walks: readonly Walk[],
  captures: readonly WalkCapture[],
): { readonly walks: readonly Walk[]; readonly captures: readonly WalkCapture[] } {
  return {
    walks: walks.filter(
      (walk) =>
        walk.status === 'completed' &&
        walk.deletedAt === null &&
        Boolean(walk.reflectionNotes?.open?.trim() || walk.reflectionNotes?.next?.trim()),
    ),
    captures: captures.filter((capture) => capture.status === 'pending'),
  };
}
