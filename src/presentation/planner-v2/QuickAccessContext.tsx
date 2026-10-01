import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppIcon } from '../components/AppIcon';

export interface QuickAccessGuard {
  readonly dirty: boolean;
  readonly busy: boolean;
}
type GuardReader = () => QuickAccessGuard;
interface QuickAccessState {
  readonly open: boolean;
  readonly revision: number;
  readonly show: () => void;
  readonly close: () => void;
  readonly changed: () => void;
  readonly inspect: (scope?: string) => QuickAccessGuard;
  readonly register: (read: GuardReader, scope: string) => () => void;
}
const Context = createContext<QuickAccessState | null>(null);
const GuardScopeContext = createContext('root');
export function QuickAccessGuardScope({
  scope,
  children,
}: {
  readonly scope: string;
  readonly children: ReactNode;
}) {
  return <GuardScopeContext.Provider value={scope}>{children}</GuardScopeContext.Provider>;
}
export function QuickAccessProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const readers = useRef(new Set<{ readonly read: GuardReader; readonly scope: string }>());
  const register = useCallback((read: GuardReader, scope: string) => {
    const entry = { read, scope };
    readers.current.add(entry);
    return () => {
      readers.current.delete(entry);
    };
  }, []);
  const inspect = useCallback(
    (scope?: string) =>
      [...readers.current]
        .filter((entry) => !scope || entry.scope === scope)
        .reduce<QuickAccessGuard>(
          (state, entry) => {
            const next = entry.read();
            return { dirty: state.dirty || next.dirty, busy: state.busy || next.busy };
          },
          { dirty: false, busy: false },
        ),
    [],
  );
  const show = useCallback(() => {
    if (
      document.querySelector('[role="alertdialog"], dialog.account-sign-out[open]') ||
      inspect().busy
    )
      return;
    setOpen(true);
  }, [inspect]);
  const close = useCallback(() => setOpen(false), []);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.code === 'KeyK' || event.key.toLowerCase() === 'k') &&
        !event.altKey &&
        !event.repeat &&
        !event.isComposing
      ) {
        event.preventDefault();
        show();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);
  const value = useMemo(
    () => ({ open, revision, show, close, changed, inspect, register }),
    [open, revision, show, close, changed, inspect, register],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useQuickAccess = () => useContext(Context);

/** Only booleans leave the owner. In particular, account secrets never enter this registry. */
// eslint-disable-next-line react-refresh/only-export-components
export function useQuickAccessGuard(read: GuardReader) {
  const register = useQuickAccess()?.register;
  const scope = useContext(GuardScopeContext);
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => register?.(() => latest.current(), scope), [register, scope]);
}

/** For controlled, mount-scoped drafts. Saved inline editors compare against current props instead. */
// eslint-disable-next-line react-refresh/only-export-components
export function useQuickAccessDraft(draft: unknown, busy: boolean) {
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  useQuickAccessGuard(() => ({ dirty: JSON.stringify(draft) !== baseline, busy }));
  return () => setBaseline(JSON.stringify(draft));
}

export function QuickAccessTrigger({ compact = false }: { readonly compact?: boolean }) {
  const quick = useQuickAccess();
  if (!quick) return null;
  return (
    <button
      type="button"
      className={`planner-quick-trigger${compact ? ' planner-quick-trigger--compact' : ''}`}
      aria-label="Поиск и добавление"
      aria-haspopup="dialog"
      onClick={quick.show}
    >
      <AppIcon name="search" />
      <span>{compact ? 'Поиск' : 'Поиск и добавление'}</span>
      {!compact && <kbd>Ctrl K</kbd>}
    </button>
  );
}

/** Only for locally owned uncontrolled forms; controlled forms register their React state. */
// eslint-disable-next-line react-refresh/only-export-components
export function useQuickAccessUncontrolledForm(busy: boolean) {
  const form = useRef<HTMLFormElement>(null);
  useQuickAccessGuard(() => ({
    busy,
    dirty: [...(form.current?.elements ?? [])].some((element) => {
      if (element instanceof HTMLInputElement)
        return ['checkbox', 'radio'].includes(element.type)
          ? element.checked !== element.defaultChecked
          : element.value !== element.defaultValue;
      if (element instanceof HTMLSelectElement)
        return (
          element.value !==
          ([...element.options].find((option) => option.defaultSelected) ?? element.options[0])
            ?.value
        );
      return element instanceof HTMLTextAreaElement && element.value !== element.defaultValue;
    }),
  }));
  return form;
}
