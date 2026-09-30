/** A lease includes authorization and the whole transfer, so credential changes can drain it. */
export class SyncTransferGate {
  private paused = false;
  private readonly active = new Set<Promise<void>>();
  public constructor(
    private readonly isAllowed: () => Promise<boolean>,
    private readonly onPause: () => Promise<void> = async () => undefined,
  ) {}

  public async run<T>(work: () => Promise<T>): Promise<T | null> {
    if (this.paused) return null;
    let release: () => void = () => undefined;
    const lease = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.active.add(lease);
    try {
      if (!(await this.isAllowed()) || this.paused) return null;
      return await work();
    } finally {
      this.active.delete(lease);
      release();
    }
  }

  public async pauseAndDrain(): Promise<void> {
    this.paused = true;
    await Promise.all([...this.active]);
    await this.onPause();
  }

  public resume(): void {
    this.paused = false;
  }
}
