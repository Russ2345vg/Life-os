import { describe, expect, it, vi } from 'vitest';
import { EntityId, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { CompleteLifeAction } from './CompleteLifeAction';

const now = new Date('2026-09-30T12:00:00Z');
const conflict = () => new DomainError('persistence.version_conflict', 'Concurrent change');
function context(action = createLifeActionDraft('a')) {
  const repository: LifeActionRepository = {
    findById: vi.fn(async () => action as LifeAction | null),
    findByDate: async () => [],
    findByDecisionId: async () => [],
    save: vi.fn(async () => {}),
  };
  const commit = vi.fn(async () => {});
  const command = new CompleteLifeAction(repository, new FakeClock(now), new FakeIdGenerator(), {
    commit,
  });
  return { repository, commit, command, action };
}
function completed() {
  const action = createLifeActionDraft('a');
  action.complete(null, now, EntityId.create('winner'));
  return action;
}

describe('CompleteLifeAction recovery', () => {
  it('rejects a stale completion generation before changing the action', async () => {
    const c = context(completed());
    const oldKey = c.action.completionKey;
    c.action.reopen(now);
    const result = await c.command.execute({
      lifeActionId: c.action.id,
      expectedCompletionKey: oldKey,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'action.completion_changed' } });
    expect(c.action.status).toBe('draft');
    expect(c.commit).not.toHaveBeenCalled();
  });
  it('returns the committed winner of the same generation without another write', async () => {
    const c = context();
    const winner = completed();
    vi.mocked(c.repository.findById).mockResolvedValueOnce(c.action).mockResolvedValueOnce(winner);
    c.commit.mockRejectedValueOnce(conflict());
    const result = await c.command.execute({ lifeActionId: c.action.id });
    expect(result).toEqual({ ok: true, value: winner });
    expect(c.commit).toHaveBeenCalledTimes(1);
    expect(c.repository.findById).toHaveBeenCalledTimes(2);
  });
  it.each(['reopened', 'completed-again', 'deleted'] as const)(
    'does not accept a %s winner',
    async (kind) => {
      const c = context();
      const winner = completed();
      winner.reopen(now);
      if (kind === 'completed-again') winner.complete(null, now, EntityId.create('new-cycle'));
      vi.mocked(c.repository.findById)
        .mockResolvedValueOnce(c.action)
        .mockResolvedValueOnce(kind === 'deleted' ? null : winner);
      c.commit.mockRejectedValueOnce(conflict());
      const result = await c.command.execute({ lifeActionId: c.action.id });
      expect(result).toMatchObject({ ok: false, error: { code: 'persistence.version_conflict' } });
      expect(c.commit).toHaveBeenCalledTimes(1);
    },
  );
  it('does not reconcile an arbitrary storage failure', async () => {
    const c = context();
    c.commit.mockRejectedValueOnce(
      new DomainError('persistence.transaction_failed', 'Disk failed'),
    );
    expect(await c.command.execute({ lifeActionId: c.action.id })).toMatchObject({
      ok: false,
      error: { code: 'persistence.transaction_failed' },
    });
    expect(c.repository.findById).toHaveBeenCalledTimes(1);
  });
  it('preserves a failed reconciliation read without claiming success', async () => {
    const c = context();
    c.commit.mockRejectedValueOnce(conflict());
    vi.mocked(c.repository.findById)
      .mockResolvedValueOnce(c.action)
      .mockRejectedValueOnce(new Error('Read failed'));
    await expect(c.command.execute({ lifeActionId: c.action.id })).rejects.toThrow('Read failed');
  });
  it('keeps an already completed generation unchanged without another commit', async () => {
    const c = context(completed());
    const version = c.action.version;
    expect(
      (
        await c.command.execute({
          lifeActionId: c.action.id,
          expectedCompletionKey: c.action.completionKey,
        })
      ).ok,
    ).toBe(true);
    expect(c.action.version).toBe(version);
    expect(c.commit).not.toHaveBeenCalled();
  });
});
