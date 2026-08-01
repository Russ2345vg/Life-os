import type { Clock } from '../../application';

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
