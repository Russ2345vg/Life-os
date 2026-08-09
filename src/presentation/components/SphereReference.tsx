import type { CSSProperties } from 'react';
import type { SpheresSnapshot } from '../../application';
import { EMPTY_SPHERES, findSphere } from './sphereReferenceModel';

interface SphereBadgeProps {
  readonly sphereId: string | null;
  readonly snapshot?: SpheresSnapshot;
}

export function SphereBadge({ sphereId, snapshot }: SphereBadgeProps) {
  const resolvedSnapshot = snapshot ?? EMPTY_SPHERES;
  if (sphereId === null) return <span className="sphere-reference-empty">Без сферы</span>;
  const sphere = findSphere(resolvedSnapshot, sphereId);
  if (sphere === null) {
    return <span className="sphere-reference-missing">Сфера недоступна</span>;
  }

  return (
    <span
      className="sphere-reference"
      style={{ '--sphere-color': sphere.color ?? '#6b78c7' } as CSSProperties}
    >
      <span aria-hidden="true" className="sphere-reference-icon">
        {sphere.icon ?? sphere.name.slice(0, 1).toLocaleUpperCase('ru-RU')}
      </span>
      <span className="sphere-reference-name">{sphere.name}</span>
      {sphere.status === 'archived' ? (
        <span className="sphere-reference-archived">Архивная</span>
      ) : null}
    </span>
  );
}

interface SphereSelectProps {
  readonly id?: string;
  readonly value: string | null;
  readonly snapshot?: SpheresSnapshot;
  readonly disabled?: boolean;
  readonly onChange: (sphereId: string | null) => void;
}

export function SphereSelect({ id, value, snapshot, disabled, onChange }: SphereSelectProps) {
  const resolvedSnapshot = snapshot ?? EMPTY_SPHERES;
  const selected = findSphere(resolvedSnapshot, value);
  const extraSelected =
    value !== null && !resolvedSnapshot.active.some((sphere) => sphere.id.toString() === value)
      ? selected
      : null;

  return (
    <select
      id={id}
      className="sphere-select"
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value || null)}
    >
      <option value="">Без сферы</option>
      {resolvedSnapshot.active.map((sphere) => (
        <option key={sphere.id.toString()} value={sphere.id.toString()}>
          {sphere.icon === null ? '' : `${sphere.icon} `}
          {sphere.name}
        </option>
      ))}
      {extraSelected === null && value !== null && selected === null ? (
        <option value={value}>Сфера недоступна</option>
      ) : null}
      {extraSelected === null ? null : (
        <option value={extraSelected.id.toString()}>{extraSelected.name} · Архивная</option>
      )}
    </select>
  );
}
