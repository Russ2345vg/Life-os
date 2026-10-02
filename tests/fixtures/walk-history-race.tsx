import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WalkHistoryPage, WalkHistoryQuery } from '../../src/application/ports/WalkRepository';
import type { WalkServices } from '../../src/application/walk/WalkServices';
import { DayDate, EntityId, Walk } from '../../src/domain';
import type { PlannerRoute } from '../../src/presentation/planner-v2/PlannerNavigation';
import { WalkHistory } from '../../src/presentation/planner-v2/walks/WalkHistory';

const pending: Array<{
  query: WalkHistoryQuery;
  resolve: (page: WalkHistoryPage) => void;
}> = [];
const now = new Date('2026-10-02T10:00:00Z');
const walk = (id: string) =>
  Walk.create({
    id: EntityId.create(id),
    date: DayDate.create('2026-10-02'),
    type: 'restorative',
    now,
  })
    .start({ mode: 'stopwatch', startedAt: now })
    .complete({ endedAt: new Date(now.getTime() + 60_000) })
    .reviseReflection({
      result: id,
      afterState: null,
      impact: null,
      updatedAt: new Date(now.getTime() + 61_000),
    });

const services = {
  queries: {
    list: (query: WalkHistoryQuery) =>
      new Promise<WalkHistoryPage>((resolve) => pending.push({ query, resolve })),
  },
  changes: { subscribe: () => () => {} },
} as unknown as WalkServices;

function Fixture() {
  const [route, setRoute] = useState<Extract<PlannerRoute, { view: 'walks' }>>({
    view: 'walks',
    page: 'history',
  });
  return (
    <WalkHistory
      services={services}
      route={route}
      onNavigate={(next) => {
        if (next.view === 'walks') setRoute(next);
      }}
      onOpen={() => {}}
      spheres={[]}
    />
  );
}

Object.assign(window, {
  walkHistoryFixture: {
    pendingCount: () => pending.length,
    query: (index: number) => pending[index]?.query ?? null,
    resolve: (index: number, ids: string[], nextCursor: string | null) => {
      const request = pending[index];
      if (!request) throw new Error(`Unknown request ${index}`);
      request.resolve({ items: ids.map(walk), nextCursor });
    },
  },
});

createRoot(document.getElementById('root')!).render(<Fixture />);
