import { expect, it, vi } from 'vitest';
import { SyncTransferGate } from './SyncTransferGate';

it('drains existing work and rejects queued work before replacing credentials', async () => {
  let finish: (() => void) | undefined;
  const allowed = vi.fn(async () => true);
  const close = vi.fn(async () => undefined);
  const gate = new SyncTransferGate(allowed, close);
  const active = gate.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await vi.waitFor(() => expect(finish).toBeDefined());
  let drained = false;
  const pause = gate.pauseAndDrain().then(() => {
    drained = true;
  });
  const rejected = vi.fn(async () => 1);
  expect(await gate.run(rejected)).toBeNull();
  expect(drained).toBe(false);
  finish?.();
  await active;
  await pause;
  expect(drained).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(rejected).not.toHaveBeenCalled();
  gate.resume();
  expect(await gate.run(rejected)).toBe(1);
});

it('includes authorization checks in its drain and rechecks pause after the await', async () => {
  let authorize: ((allowed: boolean) => void) | undefined;
  const gate = new SyncTransferGate(
    () =>
      new Promise<boolean>((resolve) => {
        authorize = resolve;
      }),
  );
  const work = vi.fn(async () => 1);
  const pending = gate.run(work);
  const pause = gate.pauseAndDrain();
  authorize?.(true);
  expect(await pending).toBeNull();
  await pause;
  expect(work).not.toHaveBeenCalled();
});

it('closes subscriptions after in-flight work has finished opening them', async () => {
  let finish: (() => void) | undefined;
  let subscribed = false;
  const gate = new SyncTransferGate(
    async () => true,
    async () => {
      subscribed = false;
    },
  );
  const work = gate.run(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    subscribed = true;
  });
  await vi.waitFor(() => expect(finish).toBeDefined());
  const paused = gate.pauseAndDrain();
  finish?.();
  await work;
  await paused;
  expect(subscribed).toBe(false);
});
