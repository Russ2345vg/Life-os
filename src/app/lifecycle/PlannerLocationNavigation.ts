import {
  buildPlannerLocation,
  parsePlannerLocation,
  type PlannerLocation,
} from '../../presentation/planner-v2/PlannerLocation';
import type { PlannerRoute } from '../../presentation/planner-v2/PlannerNavigation';

type Reason = 'navigate' | 'open-action' | 'replace-action' | 'close-action' | 'history';
export interface PlannerLocationTransition {
  readonly from: PlannerLocation;
  readonly to: PlannerLocation;
  readonly reason: Reason;
}

export interface PlannerLocationBrowser {
  read(): { readonly hash: string; readonly state: unknown };
  push(hash: string, state: unknown): void;
  replace(hash: string, state: unknown): void;
  go(delta: number): void;
  listen(listener: () => void): () => void;
}

interface EntryMetadata {
  readonly version: 1;
  readonly sessionId: string;
  readonly entryId: string;
  readonly index: number;
  readonly sourceEntryId: string | null;
}

function metadata(state: unknown): EntryMetadata | null {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>).lifeosNavigation;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  return entry.version === 1 &&
    typeof entry.sessionId === 'string' &&
    typeof entry.entryId === 'string' &&
    typeof entry.index === 'number' &&
    (entry.sourceEntryId === null || typeof entry.sourceEntryId === 'string')
    ? (entry as unknown as EntryMetadata)
    : null;
}

function withMetadata(state: unknown, entry: EntryMetadata): Record<string, unknown> {
  const previous =
    state !== null && typeof state === 'object' && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : {};
  return { ...previous, lifeosNavigation: entry };
}

const newId = (): string => globalThis.crypto.randomUUID();

/** The only owner of panel URL and app-owned browser-history metadata. */
export function createPlannerLocationNavigation(
  browser: PlannerLocationBrowser,
  canTransition: (transition: PlannerLocationTransition) => Promise<boolean>,
  commit: (location: PlannerLocation) => void,
  normalizePage: (page: PlannerRoute) => PlannerRoute = (page) => page,
) {
  const initial = parsePlannerLocation(browser.read().hash) ?? {
    page: { view: 'today' } as const,
    actionPanel: null,
  };
  let accepted: PlannerLocation = { ...initial, page: normalizePage(initial.page) };
  let sessionId = newId();
  let acceptedEntry: EntryMetadata = {
    version: 1,
    sessionId,
    entryId: newId(),
    index: 0,
    sourceEntryId: null,
  };
  const known = new Map<
    string,
    { readonly location: PlannerLocation; readonly entry: EntryMetadata }
  >();
  let stopListening: (() => void) | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingClose: {
    readonly sourceId: string;
    readonly resolve: (accepted: boolean) => void;
  } | null = null;
  const scheduled = new Set<string>();

  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  };
  const remember = (location: PlannerLocation, entry: EntryMetadata) => {
    known.set(entry.entryId, { location, entry });
  };
  const publish = (location: PlannerLocation, entry: EntryMetadata) => {
    accepted = location;
    acceptedEntry = entry;
    remember(location, entry);
    commit(location);
  };
  const source = (): {
    readonly location: PlannerLocation;
    readonly entry: EntryMetadata;
  } | null => {
    const id = acceptedEntry.sourceEntryId;
    const target = id ? known.get(id) : null;
    return target?.entry.sessionId === acceptedEntry.sessionId ? target : null;
  };
  const rebase = (location: PlannerLocation, state: unknown) => {
    sessionId = newId();
    const entry: EntryMetadata = {
      version: 1,
      sessionId,
      entryId: newId(),
      index: 0,
      sourceEntryId: null,
    };
    browser.replace(buildPlannerLocation(location), withMetadata(state, entry));
    publish(location, entry);
  };
  const handleHistory = async (hash: string, state: unknown, entry: EntryMetadata | null) => {
    if (hash === buildPlannerLocation(accepted) && entry?.entryId === acceptedEntry.entryId) return;
    const parsed = hash
      ? parsePlannerLocation(hash)
      : { page: { view: 'today' } as const, actionPanel: null };
    if (parsed === null) return;
    const location: PlannerLocation = { ...parsed, page: normalizePage(parsed.page) };
    const permitted = await canTransition({ from: accepted, to: location, reason: 'history' });
    const current = browser.read();
    const currentEntry = metadata(current.state);
    if (current.hash !== hash || currentEntry?.entryId !== entry?.entryId) return;
    if (!permitted) {
      if (entry?.sessionId === acceptedEntry.sessionId) {
        browser.go(acceptedEntry.index - entry.index);
      } else {
        sessionId = newId();
        const restored: EntryMetadata = {
          version: 1,
          sessionId,
          entryId: newId(),
          index: 0,
          sourceEntryId: null,
        };
        browser.push(buildPlannerLocation(accepted), withMetadata(state, restored));
        acceptedEntry = restored;
        remember(accepted, restored);
      }
      return;
    }
    if (entry?.sessionId === acceptedEntry.sessionId) {
      publish(location, entry);
    } else {
      rebase(location, state);
    }
  };
  const onHistory = () => {
    const { hash, state } = browser.read(); // capture together before an asynchronous guard
    const entry = metadata(state);
    if (pendingClose && entry?.entryId === pendingClose.sourceId) {
      const pending = pendingClose;
      pendingClose = null;
      const location = known.get(entry.entryId)?.location;
      if (location) publish(location, entry);
      pending.resolve(location !== undefined);
      return;
    }
    if (pendingClose) {
      pendingClose.resolve(false);
      pendingClose = null;
    }
    const key = `${hash}|${entry?.sessionId ?? ''}|${entry?.entryId ?? ''}`;
    if (scheduled.has(key)) return;
    scheduled.add(key);
    void run(async () => {
      try {
        await handleHistory(hash, state, entry);
      } finally {
        scheduled.delete(key);
      }
    });
  };

  return {
    get location(): PlannerLocation {
      return accepted;
    },
    start(): void {
      if (stopListening) return;
      const current = browser.read();
      browser.replace(buildPlannerLocation(accepted), withMetadata(current.state, acceptedEntry));
      remember(accepted, acceptedEntry);
      stopListening = browser.listen(onHistory);
    },
    stop(): void {
      stopListening?.();
      stopListening = null;
    },
    navigate(page: PlannerRoute): Promise<boolean> {
      return run(async () => {
        const to: PlannerLocation = { page: normalizePage(page), actionPanel: null };
        if (!(await canTransition({ from: accepted, to, reason: 'navigate' }))) return false;
        const entry: EntryMetadata = {
          version: 1,
          sessionId,
          entryId: newId(),
          index: acceptedEntry.index + 1,
          sourceEntryId: null,
        };
        browser.push(buildPlannerLocation(to), withMetadata(browser.read().state, entry));
        publish(to, entry);
        return true;
      });
    },
    openAction(actionId: string): Promise<boolean> {
      return run(async () => {
        const id = actionId.trim();
        if (!id) return false;
        if (accepted.actionPanel?.actionId === id) return true;
        const to: PlannerLocation = { page: accepted.page, actionPanel: { actionId: id } };
        const replacing = accepted.actionPanel !== null;
        if (
          !(await canTransition({
            from: accepted,
            to,
            reason: replacing ? 'replace-action' : 'open-action',
          }))
        )
          return false;
        const entry: EntryMetadata = replacing
          ? acceptedEntry
          : {
              version: 1,
              sessionId,
              entryId: newId(),
              index: acceptedEntry.index + 1,
              sourceEntryId: acceptedEntry.entryId,
            };
        const hash = buildPlannerLocation(to);
        const state = withMetadata(browser.read().state, entry);
        if (replacing) browser.replace(hash, state);
        else browser.push(hash, state);
        publish(to, entry);
        return true;
      });
    },
    closeAction(): Promise<boolean> {
      return run(async () => {
        if (accepted.actionPanel === null) return true;
        const to: PlannerLocation = { page: accepted.page, actionPanel: null };
        if (!(await canTransition({ from: accepted, to, reason: 'close-action' }))) return false;
        const previous = source();
        if (previous && previous.entry.index < acceptedEntry.index) {
          return new Promise<boolean>((resolve) => {
            pendingClose = { sourceId: previous.entry.entryId, resolve };
            browser.go(previous.entry.index - acceptedEntry.index);
          });
        }
        browser.replace(
          buildPlannerLocation(to),
          withMetadata(browser.read().state, acceptedEntry),
        );
        publish(to, acceptedEntry);
        return true;
      });
    },
  };
}
