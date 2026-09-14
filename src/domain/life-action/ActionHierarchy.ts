import { DomainError } from '../../shared/errors/DomainError';

export interface ActionParentLink {
  readonly id: string;
  readonly parentActionId?: string | null;
}

/** A LifeAction may be either a root with children or a leaf child, never both. */
export function assertActionHierarchy(actions: readonly ActionParentLink[]): void {
  const byId = new Map(actions.map((action) => [action.id, action]));
  for (const action of actions) {
    const parentId = action.parentActionId;
    if (!parentId) continue;
    if (parentId === action.id)
      throw new DomainError(
        'life_action.self_parent',
        'Действие не может быть собственным поддействием.',
      );
    const parent = byId.get(parentId);
    if (!parent)
      throw new DomainError('life_action.parent_missing', 'Родительское действие не найдено.');
    if (parent.parentActionId)
      throw new DomainError(
        'life_action.hierarchy_depth',
        'Поддействия поддерживают только один уровень.',
      );
  }
}
