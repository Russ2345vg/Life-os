import { useRef } from 'react';
import type {
  ConnectionSource,
  GetConnections,
} from '../../../application/connections/GetConnections';
import { PlannerSheet } from '../PlannerSheet';
import type { PlannerRoute } from '../PlannerNavigation';
import { ConnectionsContent } from './ConnectionsContent';

export function ConnectionsSheet({
  source,
  connections,
  onNavigate,
  onClose,
  backLabel,
}: {
  readonly source: ConnectionSource;
  readonly connections: Pick<GetConnections, 'read' | 'more'>;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly onClose: () => void;
  readonly backLabel: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <PlannerSheet title="Связи" onClose={onClose} initialFocus={() => heading.current}>
      <ConnectionsContent
        source={source}
        connections={connections}
        onNavigate={onNavigate}
        onBack={onClose}
        backLabel={backLabel}
        headingRef={heading}
      />
    </PlannerSheet>
  );
}
