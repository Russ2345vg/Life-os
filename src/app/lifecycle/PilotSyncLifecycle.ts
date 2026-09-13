import type { PilotSyncCoordinator } from '../../application/sync/pilot/PilotSyncCoordinator';

interface LifecycleDocument extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export class PilotSyncLifecycle {
  #interval: ReturnType<typeof globalThis.setInterval> | null = null;
  readonly #onWake = () => {
    if (this.document.visibilityState === 'visible') this.coordinator.trigger();
  };
  readonly #onVisibility = () => {
    if (this.document.visibilityState === 'visible') this.coordinator.trigger();
  };

  public constructor(
    private readonly coordinator: PilotSyncCoordinator,
    private readonly target: EventTarget = globalThis.window,
    private readonly document: LifecycleDocument = globalThis.document,
  ) {}

  public start(): void {
    if (this.#interval !== null) return;
    this.target.addEventListener('online', this.#onWake);
    this.target.addEventListener('focus', this.#onWake);
    this.document.addEventListener('visibilitychange', this.#onVisibility);
    this.#interval = globalThis.setInterval(this.#onWake, 30_000);
    this.coordinator.trigger();
  }

  public close(): void {
    if (this.#interval === null) return;
    globalThis.clearInterval(this.#interval);
    this.#interval = null;
    this.target.removeEventListener('online', this.#onWake);
    this.target.removeEventListener('focus', this.#onWake);
    this.document.removeEventListener('visibilitychange', this.#onVisibility);
  }
}
