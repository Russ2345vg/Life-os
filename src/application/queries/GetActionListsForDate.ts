import {
  ACTION_SESSION_STATUS,
  LIFE_ACTION_STATUS,
  type ActionSession,
  type DayDate,
  type LifeAction,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

interface DecisionMetadata {
  readonly title: string | null;
}

const EMPTY_DECISION_METADATA: DecisionMetadata = Object.freeze({ title: null });

export const ACTION_LIST_GROUP = {
  active: 'active',
  paused: 'paused',
  ready: 'ready',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

export type ActionListGroup = (typeof ACTION_LIST_GROUP)[keyof typeof ACTION_LIST_GROUP];

export interface ActionListItem {
  readonly lifeAction: LifeAction;
  readonly decisionTitle: string | null;
  readonly sphereId: string | null;
  readonly sessions: readonly ActionSession[];
  readonly unfinishedSession: ActionSession | null;
  readonly group: ActionListGroup;
  readonly completedSessionCount: number;
  readonly totalWorkedDurationMs: number;
}

export interface ActionListsForDateSnapshot {
  readonly date: DayDate;
  readonly items: readonly ActionListItem[];
}

const GROUP_ORDER: Readonly<Record<ActionListGroup, number>> = {
  [ACTION_LIST_GROUP.active]: 0,
  [ACTION_LIST_GROUP.paused]: 1,
  [ACTION_LIST_GROUP.ready]: 2,
  [ACTION_LIST_GROUP.completed]: 3,
  [ACTION_LIST_GROUP.cancelled]: 4,
};

export class GetActionListsForDate {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #clock: Clock;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    decisionRepository: DecisionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#decisionRepository = decisionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
  }

  public async execute(date: DayDate): Promise<ActionListsForDateSnapshot> {
    const [lifeActions, unfinishedSession, allSessions, allDecisions] = await Promise.all([
      this.#lifeActionRepository.findByDate(date),
      this.#actionSessionRepository.findUnfinished(),
      this.#actionSessionRepository.findAll?.(),
      this.#decisionRepository.findAll?.(),
    ]);
    const visibleActions = lifeActions.filter((lifeAction) => !lifeAction.isArchived());
    const now = this.#clock.now();
    const decisionMetadataPromises = new Map<string, Promise<DecisionMetadata>>();
    const sessionsByActionId =
      allSessions === undefined ? null : indexSessionsByActionId(allSessions);
    const decisionMetadataById =
      allDecisions === undefined
        ? null
        : new Map(
            allDecisions.map((decision) => [
              decision.id.toString(),
              { title: decision.title.toString() },
            ]),
          );

    const items = await Promise.all(
      visibleActions.map(async (lifeAction): Promise<ActionListItem> => {
        const sessions =
          sessionsByActionId === null
            ? (await this.#actionSessionRepository.findByLifeActionId(lifeAction.id)).filter(
                (session) => session.lifeActionId.equals(lifeAction.id),
              )
            : (sessionsByActionId.get(lifeAction.id.toString()) ?? []);
        const relatedUnfinishedSession =
          unfinishedSession !== null && unfinishedSession.lifeActionId.equals(lifeAction.id)
            ? unfinishedSession
            : null;
        const decisionMetadata = await this.resolveDecisionMetadata(
          lifeAction,
          decisionMetadataPromises,
          decisionMetadataById,
        );

        return Object.freeze({
          lifeAction,
          decisionTitle: decisionMetadata.title,
          sphereId: lifeAction.sphereId?.toString() ?? null,
          sessions: Object.freeze([...sessions]),
          unfinishedSession: relatedUnfinishedSession,
          group: resolveActionListGroup(lifeAction, relatedUnfinishedSession),
          completedSessionCount: sessions.filter((session) => session.isCompleted()).length,
          totalWorkedDurationMs: sessions.reduce(
            (total, session) => total + session.workedDurationAt(now),
            0,
          ),
        });
      }),
    );

    return Object.freeze({
      date,
      items: Object.freeze([...items].sort(compareActionListItems)),
    });
  }

  private async resolveDecisionMetadata(
    lifeAction: LifeAction,
    cache: Map<string, Promise<DecisionMetadata>>,
    preloaded: ReadonlyMap<string, DecisionMetadata> | null,
  ): Promise<DecisionMetadata> {
    if (lifeAction.decisionId === null) {
      return EMPTY_DECISION_METADATA;
    }

    const key = lifeAction.decisionId.toString();
    if (preloaded !== null) {
      return preloaded.get(key) ?? EMPTY_DECISION_METADATA;
    }

    let metadataPromise = cache.get(key);

    if (metadataPromise === undefined) {
      metadataPromise = this.#decisionRepository
        .findById(lifeAction.decisionId)
        .then((decision) => ({
          title: decision?.title.toString() ?? null,
        }));
      cache.set(key, metadataPromise);
    }

    return metadataPromise;
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

export function resolveActionListGroup(
  lifeAction: LifeAction,
  unfinishedSession: ActionSession | null,
): ActionListGroup {
  if (unfinishedSession?.status === ACTION_SESSION_STATUS.paused) {
    return ACTION_LIST_GROUP.paused;
  }

  if (unfinishedSession?.status === ACTION_SESSION_STATUS.running) {
    return ACTION_LIST_GROUP.active;
  }

  switch (lifeAction.status) {
    case LIFE_ACTION_STATUS.inProgress:
      return ACTION_LIST_GROUP.active;
    case LIFE_ACTION_STATUS.ready:
    case LIFE_ACTION_STATUS.draft:
      return ACTION_LIST_GROUP.ready;
    case LIFE_ACTION_STATUS.completed:
      return ACTION_LIST_GROUP.completed;
    case LIFE_ACTION_STATUS.cancelled:
      return ACTION_LIST_GROUP.cancelled;
  }
}

function compareActionListItems(left: ActionListItem, right: ActionListItem): number {
  const groupDifference = GROUP_ORDER[left.group] - GROUP_ORDER[right.group];

  if (groupDifference !== 0) {
    return groupDifference;
  }

  const createdAtDifference =
    left.lifeAction.createdAt.getTime() - right.lifeAction.createdAt.getTime();

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.lifeAction.id.toString().localeCompare(right.lifeAction.id.toString());
}
