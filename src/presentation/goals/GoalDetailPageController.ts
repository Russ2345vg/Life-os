import { buildGoalDetailModel } from './goalDetailPresentation';
import type { GoalDetailSource } from './GoalDetailLoader';

export type GoalDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'not-found' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly model: ReturnType<typeof buildGoalDetailModel> };

export interface GoalDetailLoadController {
  activate(): void;
  retry(): void;
  cancel(): void;
}

export function createGoalDetailLoadController(input: {
  readonly load: () => Promise<GoalDetailSource>;
  readonly publish: (state: GoalDetailLoadState) => void;
}): GoalDetailLoadController {
  let sequence = 0;

  const start = (): void => {
    const attempt = ++sequence;
    input.publish({ status: 'loading' });
    void settleGoalDetailLoad(input.load(), () => attempt === sequence).then((state) => {
      if (state !== null) input.publish(state);
    });
  };

  return {
    activate: start,
    retry: start,
    cancel() {
      sequence += 1;
    },
  };
}

export async function settleGoalDetailLoad(
  request: Promise<GoalDetailSource>,
  isCurrent: () => boolean,
): Promise<GoalDetailLoadState | null> {
  try {
    const source = await request;
    if (!isCurrent()) return null;
    return source.goal === null
      ? { status: 'not-found' }
      : { status: 'ready', model: buildGoalDetailModel({ ...source, goal: source.goal }) };
  } catch {
    return isCurrent() ? { status: 'error' } : null;
  }
}
