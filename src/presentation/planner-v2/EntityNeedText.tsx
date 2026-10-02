import type { ResolvedEntityNeed } from '../../domain/planner/resolveEntityNeed';

export function EntityNeedText({
  need,
  prominent = false,
}: {
  readonly need: ResolvedEntityNeed | null;
  readonly prominent?: boolean;
}) {
  const className = prominent
    ? 'planner-entity-need planner-entity-need--prominent'
    : 'planner-muted planner-entity-need';
  if (!need)
    return <p className={prominent ? className : 'planner-muted'}>Потребность пока не указана.</p>;
  return (
    <p className={className}>
      <span className="planner-entity-need-content">
        Потребность:{' '}
        <a href={`#/v2/needs/${encodeURIComponent(need.text)}`}>
          {prominent ? <strong>{need.text}</strong> : need.text}
        </a>
      </span>
      {need.source !== 'own' && (
        <span className="planner-entity-need-source">
          {' '}
          {!prominent && '· '}
          {need.source === 'goal' ? 'Из цели' : 'Из направления'}
        </span>
      )}
    </p>
  );
}
