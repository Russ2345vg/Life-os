import { useState, type ReactNode } from 'react';
import type { LifeAction } from '../../domain';

const STORAGE_KEY = 'lifeos.today.household-expanded';

// This identifies the exact import, not unrelated goals in the Home sphere.
// eslint-disable-next-line react-refresh/only-export-components
export function isHouseholdAction(action: LifeAction): boolean {
  return action.id.toString().startsWith('plan-import:household-2026-10-v1:actions:');
}

export function HouseholdTaskList({
  pending,
  completed,
  renderAction,
}: {
  readonly pending: readonly LifeAction[];
  readonly completed: readonly LifeAction[];
  readonly renderAction: (action: LifeAction, completed: boolean) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  if (!pending.length && !completed.length) return null;
  return (
    <details
      className="planner-details planner-household"
      aria-label="Порядок"
      open={expanded}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setExpanded(open);
        try {
          window.localStorage.setItem(STORAGE_KEY, String(open));
        } catch {
          /* Keep the list usable when browser storage is unavailable. */
        }
      }}
    >
      <summary>
        Порядок{' '}
        <span>
          Выполнено {completed.length} из {pending.length + completed.length}
        </span>
      </summary>
      {pending.length ? (
        <ul>{pending.map((action) => renderAction(action, false))}</ul>
      ) : (
        <p className="planner-empty">Все бытовые дела на этот день выполнены.</p>
      )}
      {completed.length ? (
        <details className="planner-details">
          <summary>
            Выполненные бытовые дела <span>{completed.length}</span>
          </summary>
          <ul>{completed.map((action) => renderAction(action, true))}</ul>
        </details>
      ) : null}
    </details>
  );
}
