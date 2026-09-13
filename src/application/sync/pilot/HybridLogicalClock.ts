import { DomainError } from '../../../shared/errors/DomainError';

export interface HybridLogicalTimestamp {
  readonly wallTime: number;
  readonly logical: number;
}

export interface OrderedHybridLogicalTimestamp extends HybridLogicalTimestamp {
  readonly deviceId: string;
}

export const MAX_HLC_LOGICAL = 65_535;

export class HybridLogicalClock {
  #timestamp: HybridLogicalTimestamp;

  public constructor(initial: HybridLogicalTimestamp = { wallTime: 0, logical: 0 }) {
    assertTimestamp(initial);
    this.#timestamp = { ...initial };
  }

  public read(): HybridLogicalTimestamp {
    return { ...this.#timestamp };
  }

  public tick(now: number): HybridLogicalTimestamp {
    assertWallTime(now);
    this.#timestamp =
      now > this.#timestamp.wallTime ? { wallTime: now, logical: 0 } : increment(this.#timestamp);
    return this.read();
  }

  public merge(remote: HybridLogicalTimestamp, now: number): HybridLogicalTimestamp {
    assertTimestamp(remote);
    assertWallTime(now);
    const wallTime = Math.max(now, this.#timestamp.wallTime, remote.wallTime);
    let logical = 0;
    if (wallTime === this.#timestamp.wallTime && wallTime === remote.wallTime) {
      logical = Math.max(this.#timestamp.logical, remote.logical) + 1;
    } else if (wallTime === this.#timestamp.wallTime) {
      logical = this.#timestamp.logical + 1;
    } else if (wallTime === remote.wallTime) {
      logical = remote.logical + 1;
    }
    if (logical > MAX_HLC_LOGICAL) throw invalidClock('Логический счётчик HLC переполнен.');
    this.#timestamp = { wallTime, logical };
    return this.read();
  }
}

export function compareHybridLogicalTimestamp(
  left: OrderedHybridLogicalTimestamp,
  right: OrderedHybridLogicalTimestamp,
): number {
  assertTimestamp(left);
  assertTimestamp(right);
  if (left.wallTime !== right.wallTime) return left.wallTime < right.wallTime ? -1 : 1;
  if (left.logical !== right.logical) return left.logical < right.logical ? -1 : 1;
  return left.deviceId.localeCompare(right.deviceId);
}

function increment(timestamp: HybridLogicalTimestamp): HybridLogicalTimestamp {
  if (timestamp.logical >= MAX_HLC_LOGICAL)
    throw invalidClock('Логический счётчик HLC переполнен.');
  return { wallTime: timestamp.wallTime, logical: timestamp.logical + 1 };
}

function assertTimestamp(timestamp: HybridLogicalTimestamp): void {
  assertWallTime(timestamp.wallTime);
  if (
    !Number.isSafeInteger(timestamp.logical) ||
    timestamp.logical < 0 ||
    timestamp.logical > MAX_HLC_LOGICAL
  ) {
    throw invalidClock('Некорректный логический счётчик HLC.');
  }
}

function assertWallTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw invalidClock('Некорректное физическое время HLC.');
}

function invalidClock(message: string): DomainError {
  return new DomainError('sync.hlc_invalid', message);
}
