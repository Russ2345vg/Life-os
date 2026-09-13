import '../../src/presentation/styles/global.css';
import { createRoot } from 'react-dom/client';
import { Direction, EntityId } from '../../src/domain';
import type { DirectionOverviewItem } from '../../src/application';
import { DirectionsSection } from '../../src/presentation/management/DirectionsSection';

// Isolated ports: no IndexedDB, sync or user records are accessed by this fixture.
let direction = Direction.create({
  id: EntityId.create('fixture-direction'),
  name: 'Тестовое направление',
  now: new Date('2026-09-09T00:00:00Z'),
});
const pending: {
  resolve: (items: readonly DirectionOverviewItem[]) => void;
  reject: (error: Error) => void;
}[] = [];
let failMain = true;
let finishMain: (() => void) | undefined;
const unavailable = async () => {
  throw new Error('Test storage failure');
};
const props = {
  getDirectionsOverview: {
    execute: () =>
      new Promise<readonly DirectionOverviewItem[]>((resolve, reject) =>
        pending.push({ resolve, reject }),
      ),
  },
  getSpheres: { execute: async () => ({ active: [], archived: [] }) },
  getDirectionDetails: { execute: unavailable },
  createDirection: { execute: unavailable },
  updateDirection: { execute: unavailable },
  archiveDirection: { execute: unavailable },
  restoreDirection: { execute: unavailable },
  makeDirectionMain: {
    execute: async () => {
      if (failMain) throw new Error('Test main write failure');
      await new Promise<void>((resolve) => {
        finishMain = resolve;
      });
      direction = direction.makeMain(new Date());
      return { ok: true as const, value: direction };
    },
  },
  makeProjectMain: { execute: unavailable },
  createProject: { execute: unavailable },
  applyDirectionStrategicReview: { execute: unavailable },
  onOpenProject: () => undefined,
};
export function DirectionsFixture() {
  return (
    <>
      <nav aria-label="Fixture controls">
        <button
          onClick={() =>
            pending.shift()?.resolve([
              {
                direction,
                isMain: direction.isMain,
                activeProjectCount: 0,
                totalProjectCount: 0,
              },
            ])
          }
        >
          Resolve query
        </button>
        <button onClick={() => pending.shift()?.reject(new Error('Test read failure'))}>
          Reject query
        </button>
        <button
          onClick={() => {
            failMain = false;
          }}
        >
          Allow main save
        </button>
        <button onClick={() => finishMain?.()}>Resolve main save</button>
      </nav>
      <div className="management-page">
        <DirectionsSection {...props} />
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<DirectionsFixture />);
