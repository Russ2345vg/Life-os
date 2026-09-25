import {
  ActionActualResult,
  ActionCancelReason,
  ActionExpectedResult,
  type DayDate,
  EntityId,
  LifeAction,
  LifeActionTitle,
} from '../../domain';

const CREATED_AT = new Date('2026-08-01T08:00:00.000+09:00');
const CHANGED_AT = new Date('2026-08-01T09:00:00.000+09:00');

interface CreateLifeActionDraftOptions {
  readonly createdAt?: Date;
  readonly decisionId?: EntityId;
  readonly description?: string;
  readonly sphereId?: EntityId | null;
}

export function lifeActionId(value: string): EntityId {
  return EntityId.create(value);
}

export function createLifeActionDraft(
  id: string,
  options: CreateLifeActionDraftOptions = {},
): LifeAction {
  return LifeAction.createDraft({
    id: lifeActionId(id),
    title: LifeActionTitle.create(`Действие ${id}`),
    ...(options.decisionId === undefined ? {} : { decisionId: options.decisionId }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.sphereId === undefined ? {} : { sphereId: options.sphereId }),
    createdAt: options.createdAt ?? CREATED_AT,
    eventId: lifeActionId(`${id}-draft-event`),
  });
}

export function createReadyLifeAction(
  id: string,
  plannedDate: DayDate,
  options: CreateLifeActionDraftOptions = {},
): LifeAction {
  const lifeAction = createLifeActionDraft(id, options);
  lifeAction.makeReady({
    expectedResult: ActionExpectedResult.create(`Результат ${id}`),
    plannedDate,
    occurredAt: CHANGED_AT,
    eventId: lifeActionId(`${id}-ready-event`),
  });
  return lifeAction;
}

export function markLifeActionInProgress(lifeAction: LifeAction): LifeAction {
  lifeAction.markInProgress(CHANGED_AT, lifeActionId(`${lifeAction.id.toString()}-started-event`));
  return lifeAction;
}

export function completeLifeAction(lifeAction: LifeAction): LifeAction {
  if (lifeAction.startedAt === null) {
    markLifeActionInProgress(lifeAction);
  }
  lifeAction.complete(
    ActionActualResult.create('Действие выполнено'),
    CHANGED_AT,
    lifeActionId(`${lifeAction.id.toString()}-completed-event`),
  );
  return lifeAction;
}

export function cancelLifeAction(lifeAction: LifeAction): LifeAction {
  lifeAction.cancel(
    CHANGED_AT,
    lifeActionId(`${lifeAction.id.toString()}-cancelled-event`),
    ActionCancelReason.create('Действие больше не требуется'),
  );
  return lifeAction;
}

export function archiveLifeAction(lifeAction: LifeAction): LifeAction {
  if (!lifeAction.isArchived()) {
    lifeAction.archive(CHANGED_AT, lifeActionId(`${lifeAction.id.toString()}-archived-event`));
  }
  return lifeAction;
}

export function softDeleteLifeAction(lifeAction: LifeAction): LifeAction {
  if (!lifeAction.isDeleted()) {
    lifeAction.softDelete(CHANGED_AT);
  }
  return lifeAction;
}

export function restoreLifeActionFromTrash(lifeAction: LifeAction): LifeAction {
  if (lifeAction.isDeleted()) {
    lifeAction.restoreFromTrash(CHANGED_AT);
  }
  return lifeAction;
}
