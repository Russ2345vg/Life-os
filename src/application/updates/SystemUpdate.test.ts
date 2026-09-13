import { describe, expect, it, vi } from 'vitest';
import {
  SystemUpdateCoordinator,
  isBackgroundUpdateCheckDue,
  type SystemUpdateService,
} from './SystemUpdate';

describe('SystemUpdateCoordinator', () => {
  it('quiet check remains unobtrusive when the installed version is current', async () => {
    const service: SystemUpdateService = {
      check: vi.fn(async () => null),
      install: vi.fn(async () => undefined),
    };
    const coordinator = new SystemUpdateCoordinator('1.0.2', service);

    await coordinator.check({ quiet: true });

    expect(coordinator.currentState).toEqual({
      status: 'idle',
      currentVersion: '1.0.2',
    });
  });

  it('exposes an available update and installs only after an explicit action', async () => {
    const service: SystemUpdateService = {
      check: vi.fn(async () => ({ version: '1.0.3', notes: 'Исправления.' })),
      install: vi.fn(async (onProgress) => {
        onProgress({ downloadedBytes: 50, totalBytes: 100 });
      }),
    };
    const coordinator = new SystemUpdateCoordinator('1.0.2', service);

    await coordinator.check();

    expect(service.install).not.toHaveBeenCalled();
    expect(coordinator.currentState).toMatchObject({
      status: 'available',
      availableVersion: '1.0.3',
      notes: 'Исправления.',
    });

    await coordinator.install();

    expect(service.install).toHaveBeenCalledTimes(1);
    expect(coordinator.currentState).toMatchObject({
      status: 'installer-opened',
      availableVersion: '1.0.3',
      progressPercent: 50,
    });
  });

  it('keeps a safe error state when verification or download fails', async () => {
    const service: SystemUpdateService = {
      check: vi.fn(async () => ({ version: '1.0.3', notes: '' })),
      install: vi.fn(async () => {
        throw new Error('SHA-256 mismatch');
      }),
    };
    const coordinator = new SystemUpdateCoordinator('1.0.2', service);

    await coordinator.check();
    await coordinator.install();

    expect(coordinator.currentState).toMatchObject({
      status: 'error',
      message: 'SHA-256 mismatch',
    });
  });
});

describe('isBackgroundUpdateCheckDue', () => {
  it('allows the first check and throttles later checks for 24 hours', () => {
    const now = Date.parse('2026-09-03T10:00:00.000Z');

    expect(isBackgroundUpdateCheckDue(null, now)).toBe(true);
    expect(isBackgroundUpdateCheckDue('2026-09-02T10:00:01.000Z', now)).toBe(false);
    expect(isBackgroundUpdateCheckDue('2026-09-02T09:59:59.000Z', now)).toBe(true);
    expect(isBackgroundUpdateCheckDue('invalid', now)).toBe(true);
  });
});
