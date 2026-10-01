import { createContext, useContext, type ReactNode } from 'react';
import type { PlanningContextValue } from './usePlanningState';

const Context = createContext<PlanningContextValue | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function usePlanning() {
  return useContext(Context);
}
export function PlanningProvider({
  value,
  children,
}: {
  readonly value: PlanningContextValue | null;
  readonly children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
