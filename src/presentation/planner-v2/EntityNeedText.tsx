import type { ResolvedEntityNeed } from '../../domain/planner/resolveEntityNeed';

export function EntityNeedText({ need }: { readonly need: ResolvedEntityNeed | null }) {
  if (!need) return <p className="planner-muted">Потребность пока не указана.</p>;
  return (
    <p className="planner-muted planner-entity-need">
      Потребность: {need.text}
      {need.source !== 'own' && (
        <span> · {need.source === 'goal' ? 'Из цели' : 'Из направления'}</span>
      )}
    </p>
  );
}
