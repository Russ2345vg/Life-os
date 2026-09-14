/** Distinguishes a held touch from a tap or a scrolling gesture. */
export class LongPressController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private suppressTimer: ReturnType<typeof setTimeout> | null = null;
  private startPoint: { x: number; y: number } | null = null;
  private suppressNextClick = false;

  public constructor(private readonly onLongPress: () => void) {}

  public down(x: number, y: number): void {
    this.cancel();
    this.startPoint = { x, y };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.startPoint = null;
      this.suppressNextClick = true;
      this.onLongPress();
    }, 520);
  }

  public move(x: number, y: number): void {
    if (
      this.startPoint &&
      (Math.abs(x - this.startPoint.x) > 12 || Math.abs(y - this.startPoint.y) > 12)
    )
      this.end();
  }

  public end(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.startPoint = null;
    if (this.suppressNextClick && !this.suppressTimer)
      this.suppressTimer = setTimeout(() => {
        this.suppressNextClick = false;
        this.suppressTimer = null;
      }, 1000);
  }

  public cancel(): void {
    this.end();
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = null;
    this.suppressNextClick = false;
  }

  public suppressTouchContextClick(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.startPoint = null;
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = null;
    this.suppressNextClick = true;
  }

  public consumeClick(): boolean {
    if (!this.suppressNextClick) return false;
    this.suppressNextClick = false;
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = null;
    return true;
  }
}
