const active = new WeakMap<Document, { count: number; previous: string }>();

export function acquirePlannerDialogScrollLock(document: Document): () => void {
  const state = active.get(document) ?? {
    count: 0,
    previous: document.documentElement.style.overflow,
  };
  state.count += 1;
  active.set(document, state);
  document.documentElement.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count > 0) return;
    document.documentElement.style.overflow = state.previous;
    active.delete(document);
  };
}
