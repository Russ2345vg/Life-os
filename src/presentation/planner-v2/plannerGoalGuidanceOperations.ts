export type GoalGuidancePlanOutcome =
  | { readonly status: 'not-committed'; readonly message: string }
  | {
      readonly status: 'committed';
      readonly actionId: string;
      readonly date: string;
      readonly refresh: 'ready' | 'failed';
      readonly message?: string;
    };

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Не удалось выполнить действие.';
}

/** The caller registers undo and closes the sheet inside work, before refresh begins. */
export async function planGoalGuidanceStep(
  work: () => Promise<{ readonly actionId: string; readonly date: string }>,
  refresh: () => Promise<void>,
): Promise<GoalGuidancePlanOutcome> {
  let committed: { readonly actionId: string; readonly date: string };
  try {
    committed = await work();
  } catch (reason: unknown) {
    return { status: 'not-committed', message: message(reason) };
  }
  try {
    await refresh();
    return { status: 'committed', ...committed, refresh: 'ready' };
  } catch (reason: unknown) {
    return {
      status: 'committed',
      ...committed,
      refresh: 'failed',
      message: message(reason),
    };
  }
}
