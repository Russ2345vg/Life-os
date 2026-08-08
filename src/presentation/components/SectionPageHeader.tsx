import type { ReactNode } from 'react';

interface SectionPageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

export function SectionPageHeader({ eyebrow, title, description, action }: SectionPageHeaderProps) {
  return (
    <header className="section-page-header">
      <div>
        <p className="section-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="section-page-description">{description}</p>
      </div>
      {action === undefined ? null : <div className="section-page-action">{action}</div>}
    </header>
  );
}
