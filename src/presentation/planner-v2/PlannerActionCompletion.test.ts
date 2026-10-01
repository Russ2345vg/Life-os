import { describe, expect, it, vi } from 'vitest';
import type { CompleteLifeAction } from '../../application';
import { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, failure } from '../../shared/result/Result';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { PlannerActionCompletion, type CompletionRefreshTask } from './PlannerActionCompletion';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(tasks: readonly CompletionRefreshTask[] = []) {
  const action = createLifeActionDraft('a');
  action.complete(null, new Date('2026-09-30T12:00:00Z'), EntityId.create('e'));
  const command = { execute: vi.fn<CompleteLifeAction['execute']>(async () => success(action)) };
  const controller = new PlannerActionCompletion(command, tasks);
  const target = { actionId: 'a', completionKey: action.completionKey };
  return { action, command, controller, target };
}
describe('completion coordination', () => {
  it('publishes durable success before reads settle and coalesces repeated clicks', async () => {
    const wait = deferred();
    const started = deferred();
    const c = setup([
      {
        key: 'workspace',
        run: async () => {
          started.resolve();
          await wait.promise;
        },
      },
    ]);
    const first = c.controller.complete(c.target);
    const second = c.controller.complete(c.target);
    await started.promise;
    expect(c.controller.getSnapshot()).toMatchObject({
      phase: 'saved',
      refresh: 'pending',
      receipt: c.target,
    });
    wait.resolve();
    await Promise.all([first, second]);
    expect(c.command.execute).toHaveBeenCalledTimes(1);
    expect(c.command.execute).toHaveBeenCalledWith({
      lifeActionId: EntityId.create('a'),
      expectedCompletionKey: c.target.completionKey,
    });
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'saved', refresh: 'ready' });
  });
  it('retries the failed suffix without repeating commit or successful preceding reads', async () => {
    const workspace = vi.fn(async () => {});
    const planning = vi.fn(async () => {}).mockRejectedValueOnce(new Error('planning failed'));
    const library = vi.fn(async () => {});
    const c = setup([
      { key: 'workspace', run: workspace },
      { key: 'planning', run: planning },
      { key: 'library', run: library },
    ]);
    await c.controller.complete(c.target);
    expect(c.controller.getSnapshot()).toMatchObject({
      phase: 'saved',
      refresh: 'failed',
      issues: [{ key: 'planning' }],
    });
    await Promise.all([
      c.controller.retryRefresh(),
      c.controller.retryRefresh(),
      c.controller.complete(c.target),
    ]);
    expect(c.command.execute).toHaveBeenCalledTimes(1);
    expect(workspace).toHaveBeenCalledTimes(1);
    expect(planning).toHaveBeenCalledTimes(2);
    expect(library).toHaveBeenCalledTimes(2);
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'saved', refresh: 'ready' });
  });
  it('does not refresh after failed storage and allows an explicit new attempt', async () => {
    const run = vi.fn(async () => {});
    const c = setup([{ key: 'workspace', run }]);
    c.command.execute.mockResolvedValueOnce(failure(new DomainError('storage', 'Not saved')));
    await c.controller.complete(c.target);
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'not_saved' });
    await c.controller.retryRefresh();
    expect(run).not.toHaveBeenCalled();
    await c.controller.complete(c.target);
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'saved' });
  });
  it('does not publish or refresh a completion after close', async () => {
    const wait = deferred();
    const run = vi.fn(async () => {});
    const c = setup([{ key: 'workspace', run }]);
    c.command.execute.mockImplementationOnce(async () => {
      await wait.promise;
      return success(c.action);
    });
    const listener = vi.fn();
    c.controller.subscribe(listener);
    const pending = c.controller.complete(c.target);
    await Promise.resolve();
    c.controller.close();
    const calls = listener.mock.calls.length;
    wait.resolve();
    await pending;
    expect(c.command.execute).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('preserves success if an observer throws and does not replay the same completed target', async () => {
    const c = setup();
    c.controller.subscribe(() => {
      throw new Error('observer');
    });
    await c.controller.complete(c.target);
    await c.controller.complete(c.target);
    expect(c.controller.getSnapshot()).toMatchObject({ phase: 'saved', refresh: 'ready' });
    expect(c.command.execute).toHaveBeenCalledTimes(1);
  });
  it('runs dependent library reads after planning has committed, including a planning failure', async () => {
    const order: string[] = [];
    const c = setup([
      {
        key: 'planning',
        run: async () => {
          await Promise.resolve();
          order.push('commit');
          throw new Error('planning');
        },
      },
      {
        key: 'library',
        run: async () => {
          order.push('read');
          throw new Error('read');
        },
      },
    ]);
    await c.controller.complete(c.target);
    expect(order).toEqual(['commit', 'read']);
    expect(c.controller.getSnapshot()).toMatchObject({
      phase: 'saved',
      refresh: 'failed',
      issues: [{ key: 'planning' }, { key: 'library' }],
    });
  });
});
