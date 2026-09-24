import type { ApplicationUpdate, ApplicationUpdateGateway } from './ApplicationUpdateGateway';

export type ApplicationUpdateState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'available' | 'installed'; readonly version: string }
  | { readonly status: 'installing'; readonly version: string; readonly progress: number | null }
  | {
      readonly status: 'error';
      readonly operation: 'check' | 'install';
      readonly version?: string;
    };

export class ApplicationUpdateService {
  readonly #gateway: ApplicationUpdateGateway;
  readonly #listeners = new Set<() => void>();
  #state: ApplicationUpdateState = { status: 'idle' };
  #update: ApplicationUpdate | null = null;
  #started = false;

  constructor(gateway: ApplicationUpdateGateway) {
    this.#gateway = gateway;
  }

  readonly getSnapshot = (): ApplicationUpdateState => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#check(true);
  }

  async check(): Promise<void> {
    await this.#check(false);
  }

  async #check(silent: boolean): Promise<void> {
    if (['checking', 'installing', 'installed'].includes(this.#state.status)) return;
    this.#releaseUpdate();
    this.#set({ status: 'checking' });
    try {
      this.#update = await this.#gateway.check();
      this.#set(
        this.#update ? { status: 'available', version: this.#update.version } : { status: 'idle' },
      );
    } catch {
      this.#set(silent ? { status: 'idle' } : { status: 'error', operation: 'check' });
    }
  }

  async install(): Promise<void> {
    const update = this.#update;
    if (!update || !['available', 'error'].includes(this.#state.status)) return;
    this.#set({ status: 'installing', version: update.version, progress: null });
    try {
      await update.install((progress) =>
        this.#set({ status: 'installing', version: update.version, progress }),
      );
      this.#set({ status: 'installed', version: update.version });
      this.#releaseUpdate();
    } catch {
      this.#set({ status: 'error', operation: 'install', version: update.version });
    }
  }

  dismiss(): void {
    if (['checking', 'installing', 'installed'].includes(this.#state.status)) return;
    this.#releaseUpdate();
    this.#set({ status: 'idle' });
  }

  #releaseUpdate(): void {
    const update = this.#update;
    this.#update = null;
    if (update) void update.close().catch(() => {});
  }

  #set(state: ApplicationUpdateState): void {
    this.#state = state;
    this.#listeners.forEach((listener) => listener());
  }
}
