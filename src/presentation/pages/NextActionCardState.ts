import { LIFE_ACTION_STATUS, type Decision, type LifeAction } from '../../domain';

export interface NextActionCardState {
  readonly lifeAction: LifeAction;
  readonly decisionTitle: string | null;
  readonly statusLabel: string;
}

export interface ResolveNextActionCardStateInput {
  readonly lifeAction: LifeAction;
  readonly decisions: readonly Decision[];
}

export function resolveNextActionCardState(
  input: ResolveNextActionCardStateInput,
): NextActionCardState {
  const decisionId = input.lifeAction.decisionId;
  const decision =
    decisionId === null
      ? null
      : (input.decisions.find((candidate) => candidate.id.equals(decisionId)) ?? null);

  return {
    lifeAction: input.lifeAction,
    decisionTitle: decision?.title.toString() ?? null,
    statusLabel: input.lifeAction.status === LIFE_ACTION_STATUS.inProgress ? 'В работе' : 'Готово',
  };
}
