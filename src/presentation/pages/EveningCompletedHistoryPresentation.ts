import type { EveningReviewSnapshot, OpenLoopItem } from '../../application';
import {
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_RESOLUTION,
  type OpenLoopResolutionKind,
} from '../../domain';

export type EveningHistoryOutcomeTone = 'complete' | 'carry' | 'revise' | 'drop' | 'neutral';
export type EveningHistoryOutcomeIcon = 'check' | 'arrow' | 'pencil' | 'drop' | 'neutral';

export interface EveningHistoryOutcomePresentation {
  readonly outcomeLabel: string;
  readonly outcomeTone: EveningHistoryOutcomeTone;
  readonly outcomeIcon: EveningHistoryOutcomeIcon;
}

export interface EveningTodayHistoryCardModel {
  readonly key: string;
  readonly entityClass: 'is-decision' | 'is-life-action' | 'is-action-session';
  readonly typeLabel: 'Решение' | 'Действие' | 'Сессия действия';
  readonly title: string;
  readonly context: readonly string[];
  readonly outcomeLabel: string;
  readonly outcomeTone: EveningHistoryOutcomeTone;
  readonly outcomeIcon: EveningHistoryOutcomeIcon;
}

export interface EveningTodayHistoryModel {
  readonly summary: Readonly<{
    reviewed: number;
    total: number;
    completed: number;
    carriedForward: number;
  }>;
  readonly cards: readonly EveningTodayHistoryCardModel[];
}

export function createEveningTodayHistoryModel(
  snapshot: EveningReviewSnapshot,
): EveningTodayHistoryModel {
  const openLoops = snapshot.openLoops;
  const items = openLoops?.items ?? [];
  let completed = 0;
  let carriedForward = 0;

  const cards = items.map((item) => {
    if (item.resolution === OPEN_LOOP_RESOLUTION.complete) completed += 1;
    if (item.resolution === OPEN_LOOP_RESOLUTION.carryForward) carriedForward += 1;
    return createHistoryCard(snapshot, item);
  });

  return Object.freeze({
    summary: Object.freeze({
      reviewed: openLoops?.resolved ?? 0,
      total: openLoops?.total ?? items.length,
      completed,
      carriedForward,
    }),
    cards: Object.freeze(cards),
  });
}

export function openLoopResolutionHistoryLabel(resolution: OpenLoopResolutionKind | null): string {
  return eveningHistoryOutcomePresentation(resolution).outcomeLabel;
}

export function eveningHistoryOutcomePresentation(
  resolution: OpenLoopResolutionKind | null,
): EveningHistoryOutcomePresentation {
  if (resolution === OPEN_LOOP_RESOLUTION.complete) {
    return { outcomeLabel: 'Завершено', outcomeTone: 'complete', outcomeIcon: 'check' };
  }
  if (resolution === OPEN_LOOP_RESOLUTION.carryForward) {
    return { outcomeLabel: 'Перенесено', outcomeTone: 'carry', outcomeIcon: 'arrow' };
  }
  if (resolution === OPEN_LOOP_RESOLUTION.revise) {
    return { outcomeLabel: 'Изменено', outcomeTone: 'revise', outcomeIcon: 'pencil' };
  }
  if (resolution === OPEN_LOOP_RESOLUTION.drop) {
    return { outcomeLabel: 'Отказались', outcomeTone: 'drop', outcomeIcon: 'drop' };
  }
  return {
    outcomeLabel: 'Сохранено без отдельного исхода',
    outcomeTone: 'neutral',
    outcomeIcon: 'neutral',
  };
}

function createHistoryCard(
  snapshot: EveningReviewSnapshot,
  item: OpenLoopItem,
): EveningTodayHistoryCardModel {
  return Object.freeze({
    key: `${item.entityType}:${item.entityId}`,
    ...entityPresentation(item),
    title: item.title,
    context: Object.freeze(historyContext(snapshot, item)),
    ...eveningHistoryOutcomePresentation(item.resolution),
  });
}

function entityPresentation(
  item: OpenLoopItem,
): Pick<EveningTodayHistoryCardModel, 'entityClass' | 'typeLabel'> {
  if (item.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
    return { entityClass: 'is-decision', typeLabel: 'Решение' };
  }
  if (item.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
    return { entityClass: 'is-life-action', typeLabel: 'Действие' };
  }
  return { entityClass: 'is-action-session', typeLabel: 'Сессия действия' };
}

function historyContext(snapshot: EveningReviewSnapshot, item: OpenLoopItem): string[] {
  if (item.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
    const decision = snapshot.decisions.find(
      (candidate) => candidate.id.toString() === item.entityId,
    );
    return compactContext([
      decision?.projectReference === null || decision?.projectReference === undefined
        ? null
        : `Связано с Проектом «${decision.projectReference}»`,
      (decision?.rescheduleCount ?? 0) > 0
        ? `Переносилось · ${decision?.rescheduleCount ?? 0}`
        : null,
      'Сегодня',
    ]);
  }

  if (item.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
    const action = snapshot.lifeActions.find(
      (candidate) => candidate.id.toString() === item.entityId,
    );
    const decisionId = action?.decisionId ?? null;
    const decision =
      decisionId === null
        ? undefined
        : snapshot.decisions.find((candidate) => candidate.id.equals(decisionId));
    return compactContext([
      decision === undefined ? null : `Связано с Решением «${decision.title.toString()}»`,
      (action?.rescheduleCount ?? 0) > 0 ? `Переносилось · ${action?.rescheduleCount ?? 0}` : null,
      'Сегодня',
    ]);
  }

  const session = snapshot.actionSessions.find(
    (candidate) => candidate.id.toString() === item.entityId,
  );
  const action =
    session === undefined
      ? undefined
      : snapshot.lifeActions.find((candidate) => candidate.id.equals(session.lifeActionId));
  return compactContext([
    action === undefined ? null : `Действие «${action.title.toString()}»`,
    'Сегодня',
  ]);
}

function compactContext(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}
