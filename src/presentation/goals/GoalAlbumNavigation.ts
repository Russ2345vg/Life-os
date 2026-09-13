import { legacyProjectGoalId } from '../../shared/legacyGoalIdentity';
export type GoalAlbumRoute =
  | { readonly view: 'album' }
  | { readonly view: 'create' }
  | { readonly view: 'detail'; readonly goalId: string }
  | { readonly view: 'edit'; readonly goalId: string };

export function parseGoalAlbumRoute(hash: string): GoalAlbumRoute | null {
  if (hash === '#/projects' || hash === '#/management/projects') return { view: 'album' };
  const legacy = /^#\/(?:management\/)?projects\/([^/?]+)(\/edit)?$/.exec(hash);
  if (legacy) {
    if (legacy[1] === 'new') return { view: 'create' };
    const rawId = decodeGoalId(legacy[1] ?? '');
    return rawId === null
      ? null
      : { view: legacy[2] ? 'edit' : 'detail', goalId: legacyProjectGoalId(rawId) };
  }
  if (hash === '#/goals') return { view: 'album' };
  if (hash === '#/goals/new') return { view: 'create' };

  const editMatch = /^#\/goals\/([^/?]+)\/edit$/.exec(hash);
  if (editMatch !== null) {
    const encodedGoalId = editMatch[1] ?? '';
    if (encodedGoalId === 'new') return null;
    const goalId = decodeGoalId(encodedGoalId);
    return goalId === null ? null : { view: 'edit', goalId };
  }

  const detailMatch = /^#\/goals\/([^/?]+)$/.exec(hash);
  if (detailMatch === null) return null;
  const goalId = decodeGoalId(detailMatch[1] ?? '');
  return goalId === null ? null : { view: 'detail', goalId };
}

export function buildGoalAlbumRoute(route: GoalAlbumRoute): string {
  switch (route.view) {
    case 'album':
      return '#/goals';
    case 'create':
      return '#/goals/new';
    case 'detail':
      return `#/goals/${encodeGoalId(route.goalId)}`;
    case 'edit':
      return `#/goals/${encodeGoalId(route.goalId)}/edit`;
  }
}

function decodeGoalId(value: string): string | null {
  try {
    const goalId = decodeURIComponent(value);
    return goalId.trim() === '' ? null : goalId;
  } catch {
    return null;
  }
}

function encodeGoalId(goalId: string): string {
  if (goalId.trim() === '') {
    throw new Error('Goal detail route requires a non-blank identifier.');
  }

  return goalId === 'new' ? '%6E%65%77' : encodeURIComponent(goalId);
}
