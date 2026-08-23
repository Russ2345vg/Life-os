import type { ReactNode } from 'react';

interface ManagementDaySectionProps {
  readonly children: ReactNode;
}

export function ManagementDaySection({ children }: ManagementDaySectionProps) {
  return (
    <section className="management-day-section" aria-label="Управление · День">
      {children}
    </section>
  );
}
