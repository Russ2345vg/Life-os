import { useState } from 'react';
import type { Walk } from '../../../domain/walk/Walk';
import type { MemoryDraft } from '../../../domain/memory';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import type { PlannerRoute } from '../PlannerNavigation';
import { MemoryEditor } from '../memory/MemoryEditor';
import { useWalkMutation } from './useWalkState';
export function WalkMemoryTransfer({
  walk,
  services,
  memory,
  today,
  onNavigate,
}: {
  walk: Walk;
  services: WalkServices;
  memory: MemoryServices;
  today: string;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [draft, setDraft] = useState<MemoryDraft | null>(null);
  const mutation = useWalkMutation();
  return (
    <>
      <button
        disabled={mutation.busy || !memory.commands.enabled}
        onClick={() =>
          void mutation.perform(
            `memory:${walk.id}:${walk.version}`,
            (requestId) =>
              services.memoryExport.prepare({
                walkId: walk.id.toString(),
                expectedVersion: walk.version,
                requestId,
              }),
            (result) => {
              if (result.kind === 'draft') setDraft(result.draft);
              else onNavigate({ view: 'memory', id: result.event.id.toString() });
            },
          )
        }
      >
        Сохранить в память жизни
      </button>
      {mutation.error && <p role="alert">{mutation.error}</p>}
      {draft && (
        <MemoryEditor
          initialDraft={draft}
          expectedVersion={null}
          services={memory}
          today={today}
          catalog={{ spheres: [], directions: [], goals: [] }}
          onCancel={() => setDraft(null)}
          onSaved={(event) => {
            setDraft(null);
            onNavigate({ view: 'memory', id: event.id.toString() });
          }}
        />
      )}
    </>
  );
}
