import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, LIFE_ACTION_STATUS, type LifeAction } from '../../domain';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { SetLifeActionPlan } from './SetLifeActionPlan';

const ORIGINAL_DATE = DayDate.create('2026-09-25');
const NEXT_DATE = DayDate.create('2026-09-26');

describe('SetLifeActionPlan caller status guard', () => {
  it('rejects a stale quick-access reschedule after the action becomes completed', async () => {
    const action = completeLifeAction(createReadyLifeAction('stale', ORIGINAL_DATE));
    const repository = new SingleActionRepository(action);
    const commits: unknown[] = [];
    const unitOfWork: JournalUnitOfWork = {
      commit: async (input) => {
        commits.push(input);
      },
    };
    const command = new SetLifeActionPlan(
      repository,
      unitOfWork,
      new FakeClock(new Date('2026-09-25T12:00:00Z')),
      new FakeIdGenerator('plan'),
    );

    const result = await command.execute({
      lifeActionId: action.id,
      plannedDate: NEXT_DATE,
      allowedStatuses: [LIFE_ACTION_STATUS.draft, LIFE_ACTION_STATUS.ready],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('life_action.status_changed');
    expect(action.plannedDate?.toString()).toBe(ORIGINAL_DATE.toString());
    expect(commits).toHaveLength(0);
  });

  it('keeps legacy completed scheduling available when the caller supplies no guard', async () => {
    const action = completeLifeAction(createReadyLifeAction('legacy', ORIGINAL_DATE));
    const repository = new SingleActionRepository(action);
    const unitOfWork: JournalUnitOfWork = { commit: async () => undefined };
    const command = new SetLifeActionPlan(
      repository,
      unitOfWork,
      new FakeClock(new Date('2026-09-25T12:00:00Z')),
      new FakeIdGenerator('plan'),
    );

    const result = await command.execute({ lifeActionId: action.id, plannedDate: NEXT_DATE });

    expect(result.ok).toBe(true);
    expect(action.plannedDate?.toString()).toBe(NEXT_DATE.toString());
  });
});

class SingleActionRepository implements LifeActionRepository {
  public constructor(private readonly action: LifeAction) {}

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.action.id.equals(id) ? this.action : null;
  }

  public async findByDate(): Promise<readonly LifeAction[]> {
    return [this.action];
  }

  public async findByDecisionId(): Promise<readonly LifeAction[]> {
    return [this.action];
  }

  public async save(): Promise<void> {}
}
