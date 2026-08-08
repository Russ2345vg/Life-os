import {
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type DecisionKind,
  type DecisionPriority,
  type DecisionStatus,
  type LifeActionStatus,
} from '../domain';

export function decisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case DECISION_STATUS.draft:
      return 'Черновик';
    case DECISION_STATUS.planned:
      return 'Запланировано';
    case DECISION_STATUS.inProgress:
      return 'Выполняется';
    case DECISION_STATUS.confirmed:
      return 'Подтверждено';
    case DECISION_STATUS.cancelled:
      return 'Отменено';
  }
}

export function decisionKindLabel(kind: DecisionKind): string {
  return kind === DECISION_KIND.main ? 'Главное решение' : 'Дополнительное решение';
}

export function decisionPriorityLabel(priority: DecisionPriority): string {
  switch (priority) {
    case DECISION_PRIORITY.high:
      return 'Высокий приоритет';
    case DECISION_PRIORITY.normal:
      return 'Обычный приоритет';
    case DECISION_PRIORITY.low:
      return 'Низкий приоритет';
  }
}

export function lifeActionStatusLabel(status: LifeActionStatus): string {
  switch (status) {
    case LIFE_ACTION_STATUS.draft:
      return 'Черновик';
    case LIFE_ACTION_STATUS.ready:
      return 'Готово';
    case LIFE_ACTION_STATUS.inProgress:
      return 'Выполняется';
    case LIFE_ACTION_STATUS.completed:
      return 'Завершено';
    case LIFE_ACTION_STATUS.cancelled:
      return 'Отменено';
  }
}

export function statusTone(status: DecisionStatus | LifeActionStatus): string {
  if (status === DECISION_STATUS.confirmed || status === LIFE_ACTION_STATUS.completed) {
    return 'positive';
  }

  if (status === DECISION_STATUS.inProgress) {
    return 'active';
  }

  if (status === DECISION_STATUS.cancelled) {
    return 'muted';
  }

  return 'neutral';
}
