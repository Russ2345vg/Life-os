import type { SyncTransferGate } from '../account/SyncTransferGate';

export type PilotSyncState = 'idle' | 'syncing' | 'offline' | 'attention' | 'error';

export interface PilotSyncStatus {
  readonly state: PilotSyncState;
  readonly pendingCount: number;
  readonly conflictCount: number;
  readonly lastSuccessfulSyncAt: string | null;
}

export interface PilotSyncRunResult {
  readonly pending: number;
  readonly conflicts: number;
  readonly quarantined: number;
  readonly lastSequence: number | null;
}

export interface PilotSyncCoordinatorDependencies {
  readonly prepareDataFormat?: () => Promise<void>;
  readonly transferGate?: SyncTransferGate;
  readonly isOnline?: () => boolean;
  readonly afterStructured?: () => void;
  readonly bootstrap: { run(): Promise<unknown> };
  readonly push: { run(): Promise<{ readonly failed: number }> };
  readonly pull: { run(): Promise<{ readonly quarantined: number }> };
  readonly metrics: {
    counts(): Promise<{
      readonly pending: number;
      readonly conflicts: number;
      readonly quarantined: number;
    }>;
    installation?(): Promise<{ readonly spaceId: string | null } | null>;
    cursor?(spaceId: string): Promise<number>;
  };
  readonly hints?: {
    ensure(onHint: () => void): Promise<void>;
    close(): Promise<void>;
  };
  readonly now?: () => Date;
  readonly setTimer?: typeof globalThis.setTimeout;
  readonly clearTimer?: typeof globalThis.clearTimeout;
}

export class PilotSyncCoordinator {
  readonly #listeners = new Set<(status: PilotSyncStatus) => void>();
  readonly #now: () => Date;
  readonly #setTimer: typeof globalThis.setTimeout;
  readonly #clearTimer: typeof globalThis.clearTimeout;
  #status: PilotSyncStatus = {
    state: 'idle',
    pendingCount: 0,
    conflictCount: 0,
    lastSuccessfulSyncAt: null,
  };
  #inFlight: Promise<PilotSyncRunResult> | null = null;
  #debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #closed = false;
  #rerun = false;

  public constructor(private readonly dependencies: PilotSyncCoordinatorDependencies) {
    this.#now = dependencies.now ?? (() => new Date());
    this.#setTimer = (dependencies.setTimer ?? globalThis.setTimeout).bind(globalThis);
    this.#clearTimer = (dependencies.clearTimer ?? globalThis.clearTimeout).bind(globalThis);
  }

  public status(): PilotSyncStatus {
    return this.#status;
  }

  public subscribe(listener: (status: PilotSyncStatus) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#status);
    return () => this.#listeners.delete(listener);
  }

  public trigger(): void {
    if (this.#closed) return;
    if (this.#debounceTimer !== null) this.#clearTimer(this.#debounceTimer);
    this.#debounceTimer = this.#setTimer(() => {
      this.#debounceTimer = null;
      void this.run();
    }, 1_500);
  }

  public async run(): Promise<void> {
    await this.runAndReport();
  }

  public async runAndReport(): Promise<PilotSyncRunResult> {
    if (this.#closed) return this.currentReport();
    if (this.#inFlight !== null) {
      this.#rerun = true;
      return this.#inFlight;
    }
    this.#inFlight = this.execute();
    let result: PilotSyncRunResult;
    try {
      result = await this.#inFlight;
    } finally {
      this.#inFlight = null;
      if (this.#rerun && !this.#closed) {
        this.#rerun = false;
        await this.runAndReport();
      }
    }
    return result;
  }

  public async close(): Promise<void> {
    this.#closed = true;
    if (this.#debounceTimer !== null) this.#clearTimer(this.#debounceTimer);
    await this.#inFlight;
    await this.dependencies.hints?.close();
    this.#listeners.clear();
  }

  private async execute(): Promise<PilotSyncRunResult> {
    if (this.dependencies.transferGate === undefined) return this.executeAllowed();
    try {
      const result = await this.dependencies.transferGate.run(() => this.executeAllowed());
      if (result !== null) return result;
    } catch {
      /* Authorization unavailable: preserve queue and report no completed exchange. */
    }
    const counts = await this.dependencies.metrics.counts();
    this.update({
      ...this.#status,
      state: 'attention',
      pendingCount: counts.pending,
      conflictCount: counts.conflicts,
    });
    return { ...counts, lastSequence: null };
  }

  private async executeAllowed(): Promise<PilotSyncRunResult> {
    this.update({ ...this.#status, state: 'syncing' });
    try {
      if (this.dependencies.prepareDataFormat) await this.dependencies.prepareDataFormat();
      await this.dependencies.bootstrap.run();
      await this.dependencies.hints?.ensure(() => this.trigger());
      const push = await this.dependencies.push.run();
      const pull = await this.dependencies.pull.run();
      const counts = await this.dependencies.metrics.counts();
      const installation = await this.dependencies.metrics.installation?.();
      const lastSequence =
        installation === undefined || installation === null || installation.spaceId === null
          ? null
          : ((await this.dependencies.metrics.cursor?.(installation.spaceId)) ?? null);
      this.update({
        state:
          pull.quarantined > 0 || counts.conflicts > 0 || counts.quarantined > 0
            ? 'attention'
            : push.failed > 0
              ? this.dependencies.isOnline?.()
                ? 'error'
                : 'offline'
              : 'idle',
        pendingCount: counts.pending,
        conflictCount: counts.conflicts,
        lastSuccessfulSyncAt:
          push.failed === 0 && pull.quarantined === 0
            ? this.#now().toISOString()
            : this.#status.lastSuccessfulSyncAt,
      });
      return {
        pending: counts.pending,
        conflicts: counts.conflicts,
        quarantined: Math.max(counts.quarantined, pull.quarantined),
        lastSequence,
      };
    } catch {
      const counts = await this.dependencies.metrics.counts().catch(() => ({
        pending: 0,
        conflicts: 0,
        quarantined: 0,
      }));
      this.update({
        ...this.#status,
        state: this.dependencies.isOnline?.() ? 'error' : 'offline',
        pendingCount: counts.pending,
        conflictCount: counts.conflicts,
      });
      return {
        pending: counts.pending,
        conflicts: counts.conflicts,
        quarantined: counts.quarantined,
        lastSequence: null,
      };
    } finally {
      if (!this.#closed) this.dependencies.afterStructured?.();
    }
  }

  private currentReport(): PilotSyncRunResult {
    return {
      pending: this.#status.pendingCount,
      conflicts: this.#status.conflictCount,
      quarantined: 0,
      lastSequence: null,
    };
  }

  private update(status: PilotSyncStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }
}
