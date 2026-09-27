import type { LifeAction } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import { recurrenceLabel } from '../../application/planner/actionSelection';
import { usePlanning } from './PlanningContext';

export function RecurrenceBadge({
  action,
  rule,
  label,
}: {
  readonly label?: string | null | undefined;
  readonly action?: LifeAction;
  readonly rule?: RecurrenceRule | null;
}) {
  const context = usePlanning();
  const selected = rule ?? context?.state?.rules.find((r) => r.id === action?.occurrence?.ruleId);
  if (!selected && !action?.occurrence) return null;
  return (
    <span className="planner-recurrence-badge">
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4 4m-4-4 4-4" />
      </svg>
      <span className="planner-recurrence-label">{label ?? recurrenceLabel(selected)}</span>
    </span>
  );
}
