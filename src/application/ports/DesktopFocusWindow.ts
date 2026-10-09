export interface DesktopFocusWindow {
  readonly available: boolean;
  setActive(active: boolean): Promise<void>;
  restore(): Promise<void>;
  drag(): Promise<void>;
  subscribe(listener: (compact: boolean, error?: string) => void): Promise<() => void>;
}
