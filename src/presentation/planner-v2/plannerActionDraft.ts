export interface PlannerFieldDraft {
  readonly value: string;
  readonly baseValue: string;
}
export function plannerFieldState(draft: PlannerFieldDraft | null, saved: string) {
  return {
    value: draft?.value ?? saved,
    conflict: draft !== null && draft.baseValue !== saved && draft.value !== saved,
  };
}
export function editPlannerField(
  draft: PlannerFieldDraft | null,
  saved: string,
  value: string,
): PlannerFieldDraft {
  return { value, baseValue: draft?.baseValue ?? saved };
}
