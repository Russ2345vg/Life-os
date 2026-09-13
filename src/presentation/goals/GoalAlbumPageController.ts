import type { GoalAlbumRoute } from './GoalAlbumNavigation';
import type { GoalAlbumLoader, GoalAlbumSource } from './GoalAlbumLoader';
import { buildGoalAlbumModel, type GoalAlbumModel } from './goalAlbumPresentation';

export type GoalAlbumLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly model: GoalAlbumModel };

export interface GoalAlbumLoadController {
  activate(route: GoalAlbumRoute): void;
  retry(route: GoalAlbumRoute): void;
  cancel(): void;
}

export interface GoalAlbumLoadControllerInput {
  readonly loader: Pick<GoalAlbumLoader, 'load' | 'refresh'>;
  readonly publish: (state: GoalAlbumLoadState) => void;
}

export function createGoalAlbumLoadController(
  input: GoalAlbumLoadControllerInput,
): GoalAlbumLoadController {
  let attemptSequence = 0;

  const start = (route: GoalAlbumRoute, kind: 'load' | 'refresh'): void => {
    const attempt = ++attemptSequence;
    if (route.view !== 'album') return;

    if (kind === 'refresh') input.publish({ status: 'loading' });
    const request = kind === 'load' ? input.loader.load() : input.loader.refresh();
    void settleGoalAlbumLoad(request, () => attempt === attemptSequence).then((state) => {
      if (state !== null) input.publish(state);
    });
  };

  return {
    activate(route) {
      start(route, 'load');
    },
    retry(route) {
      start(route, 'refresh');
    },
    cancel() {
      attemptSequence += 1;
    },
  };
}

export async function settleGoalAlbumLoad(
  request: Promise<GoalAlbumSource>,
  isCurrent: () => boolean,
): Promise<GoalAlbumLoadState | null> {
  try {
    const source = await request;
    if (!isCurrent()) return null;
    return { status: 'ready', model: buildGoalAlbumModel(source) };
  } catch {
    return isCurrent() ? { status: 'error' } : null;
  }
}
