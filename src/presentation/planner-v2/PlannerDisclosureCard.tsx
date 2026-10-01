import type { ReactNode } from 'react';
import { AppIcon, type AppIconName } from '../components/AppIcon';

export function PlannerDisclosureCard({
  className,
  icon,
  title,
  description,
  children,
  onToggle,
  initiallyOpen = false,
  name = 'planner-action-panels',
}: {
  readonly className?: string;
  readonly icon: AppIconName;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly onToggle?: React.ToggleEventHandler<HTMLDetailsElement>;
  readonly initiallyOpen?: boolean;
  readonly name?: string;
}) {
  return (
    <details
      className={[className, 'planner-disclosure-card'].filter(Boolean).join(' ')}
      name={name}
      open={initiallyOpen || undefined}
      onToggle={onToggle}
    >
      <summary className="planner-disclosure-card__summary">
        <span className="planner-disclosure-card__icon">
          <AppIcon name={icon} />
        </span>
        <span className="planner-disclosure-card__copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <AppIcon className="planner-disclosure-card__chevron" name="chevron-down" />
      </summary>
      <div className="planner-disclosure-card__body">{children}</div>
    </details>
  );
}
