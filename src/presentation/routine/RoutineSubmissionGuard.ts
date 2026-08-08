export class RoutineSubmissionGuard {
  #locked = false;

  public tryAcquire(): boolean {
    if (this.#locked) return false;
    this.#locked = true;
    return true;
  }

  public release(): void {
    this.#locked = false;
  }
}
