import { EntityId } from '../shared/EntityId';
import {
  copyWalkRoutineContext,
  isWalkLinkedEntity,
  isWalkReturnOrigin,
  isWalkRoutineContext,
  WALK_LINKED_ENTITY_TYPE,
  WALK_RETURN_ORIGIN,
  type WalkLinkedEntity,
  type WalkReturnOrigin,
  type WalkRoutineContext,
} from './WalkContext';

export const WALK_REENTRY_STATUS = {
  pending: 'pending',
  completed: 'completed',
  closedWithoutContinuation: 'closedWithoutContinuation',
} as const;

export const WALK_REENTRY_ACTION_KIND = {
  recovery: 'recovery',
  reviewResult: 'reviewResult',
  resumeContext: 'resumeContext',
  today: 'today',
} as const;

export type WalkReentryStatus = (typeof WALK_REENTRY_STATUS)[keyof typeof WALK_REENTRY_STATUS];
export type WalkReentryActionKind =
  (typeof WALK_REENTRY_ACTION_KIND)[keyof typeof WALK_REENTRY_ACTION_KIND];

export interface WalkReentryAction {
  readonly kind: WalkReentryActionKind;
  readonly destination: WalkReturnOrigin;
  readonly entity: WalkLinkedEntity | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContext | null;
}

export interface WalkReentry {
  readonly status: WalkReentryStatus;
  readonly action: WalkReentryAction;
  readonly preparedAt: Date;
  readonly resolvedAt: Date | null;
}

export function isWalkReentryStatus(value: unknown): value is WalkReentryStatus {
  return Object.values(WALK_REENTRY_STATUS).some((status) => status === value);
}

export function isWalkReentryActionKind(value: unknown): value is WalkReentryActionKind {
  return Object.values(WALK_REENTRY_ACTION_KIND).some((kind) => kind === value);
}

export function isWalkReentryAction(value: unknown): value is WalkReentryAction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  const entity = action.entity;
  const baseValid =
    isWalkReentryActionKind(action.kind) &&
    isWalkReturnOrigin(action.destination) &&
    (entity === null || isWalkLinkedEntity(entity)) &&
    (action.nextStep === null || typeof action.nextStep === 'string');
  if (!baseValid) return false;

  const routineContext = Object.hasOwn(action, 'routineContext') ? action.routineContext : null;
  if (routineContext === null) return true;
  if (!isWalkRoutineContext(routineContext)) return false;

  return (
    action.kind === WALK_REENTRY_ACTION_KIND.resumeContext &&
    action.destination === WALK_RETURN_ORIGIN.routine &&
    isWalkLinkedEntity(entity) &&
    entity.type === WALK_LINKED_ENTITY_TYPE.routine &&
    entity.id.equals(routineContext.source.routineBlockId)
  );
}

export function isWalkReentry(value: unknown): value is WalkReentry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reentry = value as Record<string, unknown>;
  if (
    !isWalkReentryStatus(reentry.status) ||
    !isWalkReentryAction(reentry.action) ||
    !isValidDate(reentry.preparedAt) ||
    !(reentry.resolvedAt === null || isValidDate(reentry.resolvedAt))
  ) {
    return false;
  }
  if (reentry.status === WALK_REENTRY_STATUS.pending) return reentry.resolvedAt === null;
  return (
    reentry.resolvedAt instanceof Date &&
    reentry.resolvedAt.getTime() >= reentry.preparedAt.getTime()
  );
}

export function copyWalkReentry(value: WalkReentry): WalkReentry {
  return {
    status: value.status,
    action: {
      kind: value.action.kind,
      destination: value.action.destination,
      entity:
        value.action.entity === null
          ? null
          : {
              type: value.action.entity.type,
              id: EntityId.create(value.action.entity.id.value),
            },
      nextStep: value.action.nextStep,
      routineContext: copyOptionalRoutineContext(value.action.routineContext ?? null),
    },
    preparedAt: new Date(value.preparedAt.getTime()),
    resolvedAt: value.resolvedAt === null ? null : new Date(value.resolvedAt.getTime()),
  };
}

function copyOptionalRoutineContext(context: WalkRoutineContext | null): WalkRoutineContext | null {
  return context === null ? null : copyWalkRoutineContext(context);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
