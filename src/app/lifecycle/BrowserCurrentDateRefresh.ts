import type { Clock } from '../../application';

interface VisibilityEventTarget extends Pick<Document, 'addEventListener' | 'removeEventListener'> {
  readonly visibilityState: DocumentVisibilityState;
}

type ForegroundEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface BrowserCurrentDateRefreshInput {
  readonly clock: Clock;
  readonly documentTarget: VisibilityEventTarget;
  readonly windowTarget: ForegroundEventTarget;
  readonly refresh: () => Promise<void>;
}

export function startBrowserCurrentDateRefresh(input: BrowserCurrentDateRefreshInput): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();

  const schedule = (): void => {
    if (!active) return;
    if (timer !== null) clearTimeout(timer);
    const now = input.clock.now();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      50,
    );
    timer = setTimeout(run, Math.max(1, nextMidnight.getTime() - now.getTime()));
  };

  const run = (): void => {
    if (!active) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    running = running
      .then(input.refresh)
      .catch(() => undefined)
      .then(() => schedule());
  };

  const onVisibilityChange = (): void => {
    if (input.documentTarget.visibilityState === 'visible') run();
  };
  const onForeground = (): void => run();

  input.documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  input.windowTarget.addEventListener('focus', onForeground);
  input.windowTarget.addEventListener('pageshow', onForeground);
  schedule();

  return () => {
    active = false;
    if (timer !== null) clearTimeout(timer);
    input.documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
    input.windowTarget.removeEventListener('focus', onForeground);
    input.windowTarget.removeEventListener('pageshow', onForeground);
  };
}
