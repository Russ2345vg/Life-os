import { describe, expect, it, vi } from 'vitest';
import { ApplicationUpdateService } from './ApplicationUpdateService';
import type { ApplicationUpdate, ApplicationUpdateGateway } from './ApplicationUpdateGateway';

function setup() {
  const update: ApplicationUpdate = {
    version: '1.0.14',
    install: vi.fn(async (progress) => {
      progress(45);
    }),
    close: vi.fn(async () => {}),
  };
  const gateway: ApplicationUpdateGateway = { check: vi.fn(async () => update) };
  return { update, gateway, service: new ApplicationUpdateService(gateway) };
}

describe('ApplicationUpdateService', () => {
  it('checks once at startup and never installs without a command', async () => {
    const { service, gateway, update } = setup();
    await Promise.all([service.start(), service.start()]);
    expect(gateway.check).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toEqual({ status: 'available', version: '1.0.14' });
    expect(update.install).not.toHaveBeenCalled();
  });

  it('keeps an up-to-date or unsupported application quiet', async () => {
    const service = new ApplicationUpdateService({ check: async () => null });
    await service.start();
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
    await service.install();
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('reports progress and ignores repeated install/check clicks during installation', async () => {
    const { service, gateway, update } = setup();
    let finish!: () => void;
    vi.mocked(update.install).mockImplementation(async (progress) => {
      progress(45);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await service.start();
    const pending = service.install();
    expect(service.getSnapshot()).toEqual({
      status: 'installing',
      version: '1.0.14',
      progress: 45,
    });
    service.dismiss();
    await service.check();
    await service.install();
    expect(gateway.check).toHaveBeenCalledTimes(1);
    expect(update.install).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(service.getSnapshot().status).toBe('installed');
  });

  it('keeps an automatic startup check failure quiet', async () => {
    const { service, gateway } = setup();
    vi.mocked(gateway.check).mockRejectedValueOnce(new Error('offline'));
    await service.start();
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
  });

  it('reports a failed explicit retry without interrupting the app', async () => {
    const { service, gateway } = setup();
    vi.mocked(gateway.check).mockRejectedValueOnce(new Error('offline'));
    await service.check();
    expect(service.getSnapshot()).toEqual({ status: 'error', operation: 'check' });
    await service.check();
    expect(service.getSnapshot().status).toBe('available');
  });

  it('retains the update for retry after installation fails', async () => {
    const { service, update } = setup();
    vi.mocked(update.install).mockRejectedValueOnce(new Error('invalid signature'));
    await service.start();
    await service.install();
    expect(service.getSnapshot()).toEqual({
      status: 'error',
      operation: 'install',
      version: '1.0.14',
    });
    await service.install();
    expect(service.getSnapshot().status).toBe('installed');
  });

  it('keeps an external installer handoff available for retry or dismissal', async () => {
    const { service, update } = setup();
    vi.mocked(update.install).mockResolvedValue('installer-opened');
    await service.start();
    await service.install();
    expect(service.getSnapshot()).toEqual({ status: 'available', version: '1.0.14' });
    expect(update.close).not.toHaveBeenCalled();
    await service.install();
    expect(update.install).toHaveBeenCalledTimes(2);
    service.dismiss();
    expect(service.getSnapshot()).toEqual({ status: 'idle' });
    expect(update.close).toHaveBeenCalledOnce();
  });

  it('dismisses for this session and releases the native update resource', async () => {
    const { service, update } = setup();
    await service.start();
    service.dismiss();
    await service.start();
    expect(service.getSnapshot().status).toBe('idle');
    expect(update.close).toHaveBeenCalledTimes(1);
    await service.install();
    expect(update.install).not.toHaveBeenCalled();
  });
});
