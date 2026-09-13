/** Persistence may finish after navigation; only the originating form owns its success UI. */
export async function finishPlannerSubmission<T>(
  save: () => Promise<T>,
  isCurrent: () => boolean,
  onCreated: (value: T) => void,
): Promise<void> {
  const value = await save();
  if (isCurrent()) onCreated(value);
}
