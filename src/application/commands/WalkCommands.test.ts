import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_INTENT,
  WALK_LINKED_ENTITY_TYPE,
  WALK_REFLECTION_TEMPLATE,
  WALK_RETURN_ORIGIN,
  WALK_STATUS,
  WALK_TYPE,
  type Walk,
} from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { WalkRepository } from '../ports/WalkRepository';
import { CreateWalk } from './CreateWalk';
import { DeleteWalk } from './DeleteWalk';
import { GetWalksForDate } from '../queries/GetWalksForDate';

const DATE = DayDate.create('2026-08-08');
const OTHER_DATE = DayDate.create('2026-08-09');

class TestWalkRepository implements WalkRepository {
  readonly #walks = new Map<string, Walk>();

  public async findById(id: EntityId): Promise<Walk | null> {
    return this.#walks.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Walk[]> {
    return [...this.#walks.values()];
  }

  public async findByDate(date: DayDate): Promise<readonly Walk[]> {
    return [...this.#walks.values()].filter((walk) => walk.date.equals(date));
  }

  public async findRunning(): Promise<Walk | null> {
    return [...this.#walks.values()].find((walk) => walk.status === WALK_STATUS.running) ?? null;
  }

  public async findActive(): Promise<Walk | null> {
    return (
      [...this.#walks.values()].find(
        (walk) => walk.status === WALK_STATUS.running || walk.status === WALK_STATUS.paused,
      ) ?? null
    );
  }

  public async save(walk: Walk): Promise<void> {
    this.#walks.set(walk.id.toString(), walk);
  }

  public async startIfVersionMatches(walk: Walk, expectedVersion: number) {
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return 'versionConflict' as const;
    if (
      [...this.#walks.values()].some(
        (item) => item.status === WALK_STATUS.running || item.status === WALK_STATUS.paused,
      )
    ) {
      return 'runningExists' as const;
    }
    this.#walks.set(walk.id.toString(), walk);
    return 'saved' as const;
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const walk = this.#walks.get(id.toString());
    if (walk?.version !== expectedVersion) return false;
    return this.#walks.delete(id.toString());
  }

  public async updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean> {
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return false;
    this.#walks.set(walk.id.toString(), walk);
    return true;
  }
}

describe('walk commands and query', () => {
  it.each([
    [WALK_INTENT.free, WALK_TYPE.mindful],
    [WALK_INTENT.recovery, WALK_TYPE.restorative],
    [WALK_INTENT.reflection, WALK_TYPE.reflection],
  ] as const)(
    'creates a %s walk with the canonical legacy type %s and before-state',
    async (intent, expectedType) => {
      const repository = new TestWalkRepository();
      const create = new CreateWalk(
        repository,
        new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
        new FakeIdGenerator(`walk-${intent}`),
      );
      const beforeState = { energy: 4, tension: 7, clarity: 3 } as const;

      const created = await create.execute({ date: DATE, intent, beforeState });

      expect(created).toMatchObject({
        ok: true,
        value: { intent, type: expectedType, beforeState, version: 1 },
      });
      if (!created.ok) throw created.error;
      await expect(repository.findById(created.value.id)).resolves.toMatchObject({
        intent,
        type: expectedType,
        beforeState,
      });
    },
  );

  it('creates a walk and returns only walks for the requested date', async () => {
    const repository = new TestWalkRepository();
    const create = new CreateWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('walk'),
    );
    const query = new GetWalksForDate(repository);

    const created = await create.execute({ date: DATE, type: WALK_TYPE.mindful });
    await create.execute({ date: OTHER_DATE, type: WALK_TYPE.physical });

    expect(created).toMatchObject({ ok: true, value: { type: WALK_TYPE.mindful, version: 1 } });
    expect(await query.execute(DATE)).toHaveLength(1);
    expect((await query.execute(DATE))[0]?.date.equals(DATE)).toBe(true);
  });

  it('preserves the existing linked entity and return context at the application boundary', async () => {
    const repository = new TestWalkRepository();
    const create = new CreateWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('walk-context'),
    );
    const linkedEntity = {
      type: WALK_LINKED_ENTITY_TYPE.decision,
      id: EntityId.create('decision-return'),
    } as const;
    const returnContext = {
      origin: WALK_RETURN_ORIGIN.decision,
      entity: linkedEntity,
      nextStep: 'Вернуться к выбору варианта',
    } as const;

    const created = await create.execute({
      date: DATE,
      intent: WALK_INTENT.reflection,
      linkedEntity,
      returnContext,
    });

    expect(created).toMatchObject({
      ok: true,
      value: { linkedEntity, returnContext },
    });
  });

  it('stores an explicitly selected reflection template', async () => {
    const repository = new TestWalkRepository();
    const create = new CreateWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('walk-template'),
    );

    const created = await create.execute({
      date: DATE,
      intent: WALK_INTENT.reflection,
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
    });

    expect(created).toMatchObject({
      ok: true,
      value: { reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision },
    });
  });

  it('defaults a new reflection walk to free thought guidance', async () => {
    const repository = new TestWalkRepository();
    const create = new CreateWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('walk-default-template'),
    );

    const created = await create.execute({ date: DATE, intent: WALK_INTENT.reflection });

    expect(created).toMatchObject({
      ok: true,
      value: { reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought },
    });
  });

  it('keeps reflection templates invalid for the legacy type-only creation path', async () => {
    const create = new CreateWalk(
      new TestWalkRepository(),
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('walk-legacy-template'),
    );

    const created = await create.execute({
      date: DATE,
      type: WALK_TYPE.reflection,
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
    });

    expect(created).toMatchObject({
      ok: false,
      error: { code: 'walk.invalid_reflection_template' },
    });
  });

  it('deletes a planned walk with optimistic version protection', async () => {
    const repository = new TestWalkRepository();
    const create = new CreateWalk(
      repository,
      new FakeClock(new Date('2026-08-08T08:00:00.000Z')),
      new FakeIdGenerator('delete-walk'),
    );
    const remove = new DeleteWalk(repository);
    const created = await create.execute({ date: DATE, type: WALK_TYPE.phoneFree });
    if (!created.ok) throw created.error;

    expect(
      await remove.execute({ id: created.value.id, expectedVersion: created.value.version }),
    ).toMatchObject({ ok: true });
    expect(await new GetWalksForDate(repository).execute(DATE)).toHaveLength(0);
  });
});
