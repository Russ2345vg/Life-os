import type { QuickAccessGuard } from './QuickAccessContext';

export interface PlannerActionPanelLeaveGuard {
  requestLeave(): Promise<boolean>;
  shouldBlockUnload(): boolean;
}

export function createPlannerActionPanelLeaveGuard(
  inspect: () => QuickAccessGuard,
  confirmDiscard: () => Promise<boolean>,
  onBusy?: () => void,
): PlannerActionPanelLeaveGuard {
  let pending: Promise<boolean> | null = null;
  return {
    requestLeave() {
      if (pending) return pending;
      const state = inspect();
      if (state.busy) {
        onBusy?.();
        return Promise.resolve(false);
      }
      if (!state.dirty) return Promise.resolve(true);
      pending = confirmDiscard().finally(() => {
        pending = null;
      });
      return pending;
    },
    shouldBlockUnload() {
      const state = inspect();
      return state.dirty || state.busy;
    },
  };
}
