import {
  isDecisionHasOpenActionsError,
  type EveningReviewSnapshot,
  type OpenLoopItem,
} from '../../application';
import {
  ACTION_SESSION_STATUS,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
} from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';

export type EveningResolutionFeedback =
  | Readonly<{
      kind: 'decision-has-open-actions';
      message: string;
      openActionIds: readonly string[];
    }>
  | Readonly<{ kind: 'business'; message: string }>
  | Readonly<{ kind: 'technical'; message: string }>;

export interface OpenLoopResolutionRequestGate {
  current: boolean;
}

export interface PendingOpenLoopResolution {
  readonly key: string;
  readonly resolution: OpenLoopResolutionKind;
}

export type EveningResolvingCard =
  | Readonly<{
      kind: 'open-loop';
      key: string;
      entityType: OpenLoopEntityType;
      entityId: string;
      typeLabel: 'Решение' | 'Действие';
      title: string;
      context: readonly string[];
      allowedResolutions: readonly OpenLoopResolutionKind[];
      requiresResult: boolean;
    }>
  | Readonly<{
      kind: 'active-session';
      key: string;
      entityType: typeof OPEN_LOOP_ENTITY_TYPE.actionSession;
      entityId: string;
      title: string;
      sessionLabel: string;
      durationLabel: string;
    }>;

export interface EveningResolvingViewModel {
  readonly current: EveningResolvingCard | null;
  readonly resolved: number;
  readonly total: number;
  readonly remaining: number;
}

export function createEveningResolvingViewModel(
  snapshot: EveningReviewSnapshot,
  now: Date,
  preferredKey: string | null = null,
): EveningResolvingViewModel {
  const actionable = (snapshot.openLoops?.items ?? []).filter(isActionable);
  const activeSession = snapshot.unfinishedSession;
  const activeSessionItem =
    activeSession === null
      ? undefined
      : actionable.find(
          (item) =>
            item.entityType === OPEN_LOOP_ENTITY_TYPE.actionSession &&
            item.entityId === activeSession.id.toString(),
        );

  const preferredItem =
    preferredKey === null
      ? undefined
      : actionable.find((item) => `${item.entityType}:${item.entityId}` === preferredKey);
  const current =
    activeSession !== null && activeSessionItem !== undefined
      ? createActiveSessionCard(snapshot, activeSessionItem, now)
      : createOpenLoopCard(snapshot, preferredItem ?? actionable[0]);

  return Object.freeze({
    current,
    resolved: snapshot.openLoops?.resolved ?? 0,
    total: snapshot.openLoops?.total ?? actionable.length,
    remaining: snapshot.openLoops?.remaining ?? actionable.length,
  });
}

export function createResolutionFeedback(error: DomainError): EveningResolutionFeedback {
  if (isDecisionHasOpenActionsError(error)) {
    return Object.freeze({
      kind: 'decision-has-open-actions',
      message: error.message,
      openActionIds: error.openActionIds,
    });
  }
  if (
    error.code === 'open_loop.persistence_failed' ||
    error.code === 'open_loop.concurrent_change'
  ) {
    return Object.freeze({ kind: 'technical', message: error.message });
  }
  return Object.freeze({ kind: 'business', message: error.message });
}

export function createTechnicalResolutionFeedback(): EveningResolutionFeedback {
  return Object.freeze({
    kind: 'technical',
    message: 'Не удалось сохранить результат разбора. Повторите попытку.',
  });
}

export function tryBeginOpenLoopResolution(gate: OpenLoopResolutionRequestGate): boolean {
  if (gate.current) return false;
  gate.current = true;
  return true;
}

export function pendingResolutionLabel(
  resolution: OpenLoopResolutionKind,
  defaultLabel: string,
): string {
  if (resolution === 'COMPLETE') return 'Завершаем…';
  if (resolution === 'CARRY_FORWARD') return 'Переносим…';
  if (resolution === 'DROP') return 'Сохраняем отказ…';
  if (resolution === 'REVISE') return 'Открываем…';
  return defaultLabel;
}

function isActionable(item: OpenLoopItem): boolean {
  return item.requirement === OPEN_LOOP_REQUIREMENT.requiresResolution && item.resolution === null;
}

function createActiveSessionCard(
  snapshot: EveningReviewSnapshot,
  item: OpenLoopItem,
  now: Date,
): EveningResolvingCard {
  const session = snapshot.unfinishedSession;
  if (session === null) throw new Error('Активная сессия не найдена в read model.');
  const action = snapshot.lifeActions.find((candidate) =>
    candidate.id.equals(session.lifeActionId),
  );
  const minutes = workedMinutes(session.workedDurationAt(now));
  return Object.freeze({
    kind: 'active-session',
    key: `${item.entityType}:${item.entityId}`,
    entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
    entityId: item.entityId,
    title: action?.title.toString() ?? 'Текущая работа',
    sessionLabel:
      session.status === ACTION_SESSION_STATUS.paused ? 'Сессия приостановлена' : 'Сессия действия',
    durationLabel: formatDuration(minutes),
  });
}

function createOpenLoopCard(
  snapshot: EveningReviewSnapshot,
  item: OpenLoopItem | undefined,
): EveningResolvingCard | null {
  if (item === undefined || item.entityType === OPEN_LOOP_ENTITY_TYPE.actionSession) return null;
  if (item.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
    const decision = snapshot.decisions.find(
      (candidate) => candidate.id.toString() === item.entityId,
    );
    const context = [
      decision?.projectReference === null || decision?.projectReference === undefined
        ? null
        : `Связано с · ${decision.projectReference}`,
      (decision?.rescheduleCount ?? 0) > 0
        ? `Переносилось · ${decision?.rescheduleCount ?? 0}`
        : null,
      'Сегодня',
    ].filter((value): value is string => value !== null);
    return Object.freeze({
      kind: 'open-loop',
      key: `${item.entityType}:${item.entityId}`,
      entityType: item.entityType,
      entityId: item.entityId,
      typeLabel: 'Решение',
      title: item.title,
      context: Object.freeze(context),
      allowedResolutions: item.allowedResolutions,
      requiresResult: true,
    });
  }

  const action = snapshot.lifeActions.find(
    (candidate) => candidate.id.toString() === item.entityId,
  );
  const decisionId = action?.decisionId;
  const decision =
    decisionId === null || decisionId === undefined
      ? undefined
      : snapshot.decisions.find((candidate) => candidate.id.equals(decisionId));
  const context = [
    decision === undefined ? null : `Связано с · ${decision.title.toString()}`,
    (action?.rescheduleCount ?? 0) > 0 ? `Переносилось · ${action?.rescheduleCount ?? 0}` : null,
    'Сегодня',
  ].filter((value): value is string => value !== null);
  return Object.freeze({
    kind: 'open-loop',
    key: `${item.entityType}:${item.entityId}`,
    entityType: item.entityType,
    entityId: item.entityId,
    typeLabel: 'Действие',
    title: item.title,
    context: Object.freeze(context),
    allowedResolutions: item.allowedResolutions,
    requiresResult: true,
  });
}

function workedMinutes(milliseconds: number): number {
  return Math.max(0, Math.floor(milliseconds / 60_000));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}
