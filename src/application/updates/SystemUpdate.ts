export interface AvailableSystemUpdate {
  readonly version: string;
  readonly notes: string;
}

export interface UpdateDownloadProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number | null;
}

export interface SystemUpdateService {
  check(): Promise<AvailableSystemUpdate | null>;
  install(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void>;
}

export type SystemUpdateState =
  | { readonly status: 'idle' | 'checking' | 'current'; readonly currentVersion: string }
  | {
      readonly status: 'available';
      readonly currentVersion: string;
      readonly availableVersion: string;
      readonly notes: string;
    }
  | {
      readonly status: 'downloading' | 'installer-opened';
      readonly currentVersion: string;
      readonly availableVersion: string;
      readonly notes: string;
      readonly progressPercent: number | null;
    }
  | {
      readonly status: 'error';
      readonly currentVersion: string;
      readonly message: string;
    };

export interface UpdateCheckOptions {
  readonly quiet?: boolean;
}

export interface SystemUpdateRuntime {
  readonly state: SystemUpdateState;
  readonly check: () => void;
  readonly install: () => void;
}

type UpdateStateListener = (state: SystemUpdateState) => void;

const BACKGROUND_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export function isBackgroundUpdateCheckDue(lastCheck: string | null, now: number): boolean {
  if (lastCheck === null) return true;
  const previous = Date.parse(lastCheck);
  return !Number.isFinite(previous) || now - previous >= BACKGROUND_CHECK_INTERVAL_MS;
}

export class SystemUpdateCoordinator {
  private state: SystemUpdateState;
  private readonly listeners = new Set<UpdateStateListener>();

  constructor(
    private readonly currentVersion: string,
    private readonly service: SystemUpdateService,
  ) {
    this.state = { status: 'idle', currentVersion };
  }

  get currentState(): SystemUpdateState {
    return this.state;
  }

  subscribe(listener: UpdateStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async check(options: UpdateCheckOptions = {}): Promise<void> {
    if (this.state.status === 'downloading') return;
    this.setState({ status: 'checking', currentVersion: this.currentVersion });
    try {
      const update = await this.service.check();
      if (update === null) {
        this.setState({
          status: options.quiet === true ? 'idle' : 'current',
          currentVersion: this.currentVersion,
        });
        return;
      }
      this.setState({
        status: 'available',
        currentVersion: this.currentVersion,
        availableVersion: update.version,
        notes: update.notes,
      });
    } catch (error: unknown) {
      if (options.quiet === true) {
        this.setState({ status: 'idle', currentVersion: this.currentVersion });
        return;
      }
      this.setState({
        status: 'error',
        currentVersion: this.currentVersion,
        message: getErrorMessage(error),
      });
    }
  }

  async install(): Promise<void> {
    if (this.state.status !== 'available') return;
    const update = this.state;
    let latestProgressPercent: number | null = null;
    this.setState({ ...update, status: 'downloading', progressPercent: null });
    try {
      await this.service.install((progress) => {
        const progressPercent =
          progress.totalBytes !== null && progress.totalBytes > 0
            ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
            : null;
        latestProgressPercent = progressPercent;
        this.setState({ ...update, status: 'downloading', progressPercent });
      });
      this.setState({
        ...update,
        status: 'installer-opened',
        progressPercent: latestProgressPercent,
      });
    } catch (error: unknown) {
      this.setState({
        status: 'error',
        currentVersion: this.currentVersion,
        message: getErrorMessage(error),
      });
    }
  }

  private setState(state: SystemUpdateState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  if (typeof error === 'string' && error.trim() !== '') return error;
  return 'Не удалось выполнить обновление. Повторите попытку позже.';
}
