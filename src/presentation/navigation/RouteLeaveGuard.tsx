import { createContext, type ReactNode, useContext } from 'react';

export interface RouteLeaveRegistration {
  inspect(): { readonly pending: boolean; readonly failed: boolean };
  flush(): Promise<void>;
}

export interface RouteLeaveGuard {
  register(registration: RouteLeaveRegistration): () => void;
  flushBeforeLeave(): Promise<boolean>;
  shouldBlockUnload(): boolean;
}

export function createRouteLeaveGuard(): RouteLeaveGuard {
  const registrations = new Set<RouteLeaveRegistration>();
  return {
    register(registration) {
      registrations.add(registration);
      return () => registrations.delete(registration);
    },
    async flushBeforeLeave() {
      for (const registration of registrations) {
        const state = registration.inspect();
        if (!state.pending && !state.failed) continue;
        try {
          await registration.flush();
        } catch {
          return false;
        }
        const after = registration.inspect();
        if (after.pending || after.failed) return false;
      }
      return true;
    },
    shouldBlockUnload() {
      return [...registrations].some(({ inspect }) => {
        const state = inspect();
        return state.pending || state.failed;
      });
    },
  };
}

const RouteLeaveGuardContext = createContext<RouteLeaveGuard | null>(null);

export function RouteLeaveGuardProvider({
  guard,
  children,
}: {
  readonly guard: RouteLeaveGuard;
  readonly children: ReactNode;
}) {
  return (
    <RouteLeaveGuardContext.Provider value={guard}>{children}</RouteLeaveGuardContext.Provider>
  );
}

export function useRouteLeaveGuard(): RouteLeaveGuard {
  const guard = useContext(RouteLeaveGuardContext);
  if (guard === null) throw new Error('RouteLeaveGuardProvider is missing.');
  return guard;
}
