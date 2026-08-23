import type { ActionSession, Decision, EntityId, LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface DecisionActionOverview {
  readonly lifeAction: LifeAction;
  readonly sessions: readonly ActionSession[];
}

export interface DecisionOverviewSnapshot {
  readonly decision: Decision;
  readonly actions: readonly DecisionActionOverview[];
}

export class GetDecisionOverview {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
  }

  public async execute(
    decisionId: EntityId,
  ): Promise<Result<DecisionOverviewSnapshot, DomainError>> {
    const decision = await this.#decisionRepository.findById(decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    const lifeActions = sortLifeActions(
      await this.#lifeActionRepository.findByDecisionId(decisionId),
    );
    const allSessions = await this.#actionSessionRepository.findAll?.();
    const sessionsByActionId =
      allSessions === undefined ? null : indexSessionsByActionId(allSessions);
    const actions = await Promise.all(
      lifeActions.map(async (lifeAction): Promise<DecisionActionOverview> => ({
        lifeAction,
        sessions: sortSessions(
          sessionsByActionId === null
            ? (await this.#actionSessionRepository.findByLifeActionId(lifeAction.id)).filter(
                (session) => session.lifeActionId.equals(lifeAction.id),
              )
            : (sessionsByActionId.get(lifeAction.id.toString()) ?? []),
        ),
      })),
    );

    return success({ decision, actions });
  }
}

function indexSessionsByActionId(
  sessions: readonly ActionSession[],
): ReadonlyMap<string, readonly ActionSession[]> {
  const byActionId = new Map<string, ActionSession[]>();

  for (const session of sessions) {
    const key = session.lifeActionId.toString();
    const indexed = byActionId.get(key);
    if (indexed === undefined) {
      byActionId.set(key, [session]);
    } else {
      indexed.push(session);
    }
  }

  return byActionId;
}

function sortLifeActions(lifeActions: readonly LifeAction[]): readonly LifeAction[] {
  return [...lifeActions].sort((left, right) => {
    const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return left.id.toString().localeCompare(right.id.toString());
  });
}

function sortSessions(sessions: readonly ActionSession[]): readonly ActionSession[] {
  return [...sessions].sort((left, right) => {
    const startedAtDifference = left.startedAt.getTime() - right.startedAt.getTime();

    if (startedAtDifference !== 0) {
      return startedAtDifference;
    }

    return left.id.toString().localeCompare(right.id.toString());
  });
}
