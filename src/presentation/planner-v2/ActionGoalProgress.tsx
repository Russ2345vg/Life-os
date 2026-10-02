import type { LifeAction } from '../../domain';
import { usePlanning } from './PlanningContext';

/** Read-only goal progress for an action and its explicit contribution links. */
export function ActionGoalProgress({ action }: { readonly action: LifeAction }) {
  const planning = usePlanning();
  if (!planning?.state) return null;

  const goalIds = new Set<string>();
  if (action.goalId) goalIds.add(action.goalId.toString());
  for (const link of planning.state.links) {
    if (link.removed) continue;
    if (
      (link.sourceType === 'action' && link.sourceId === action.id.toString()) ||
      (link.sourceType === 'rule' && link.sourceId === action.occurrence?.ruleId)
    ) {
      goalIds.add(link.goalId);
    }
  }

  const goals = planning.state.goals.filter(
    (goal) =>
      goalIds.has(goal.id.toString()) &&
      (goal.measurement !== null || goal.progress?.type === 'metric'),
  );
  return goals.map((goal) => {
    const progress = goal.measurement
      ? planning.progress(goal.id.toString(), planning.today)
      : null;
    const legacy = goal.progress?.type === 'metric' ? goal.progress : null;
    const prefix = goals.length > 1 ? `${goal.title}: ` : 'Цель: ';
    const value = goal.measurement
      ? progress?.complete
        ? `${progress.current.toLocaleString('ru-RU')} из ${progress.target.toLocaleString('ru-RU')} ${progress.unit}${progress.pending ? ` · ожидают значения: ${progress.pending}` : ''}`
        : 'данные синхронизируются'
      : legacy
        ? `${legacy.current.toLocaleString('ru-RU')} из ${legacy.target.toLocaleString('ru-RU')} ${legacy.unit}`
        : '';
    return (
      <span
        className="planner-action-goal-progress"
        key={goal.id.toString()}
        aria-label={`Прогресс цели «${goal.title}»: ${value}`}
      >
        {prefix}
        {value}
      </span>
    );
  });
}
