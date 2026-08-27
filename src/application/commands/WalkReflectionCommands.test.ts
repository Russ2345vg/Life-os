import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_INTENT,
  WALK_MODE,
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type EntityId as EntityIdType,
} from '../../domain';
import { FakeClock } from '../../test/helpers/Fakes';
import type { StartWalkPersistenceResult, WalkRepository } from '../ports/WalkRepository';
import { AdvanceWalkReflectionStage } from './AdvanceWalkReflectionStage';
import { DisableWalkReflectionGuidance } from './DisableWalkReflectionGuidance';

const DATE = DayDate.create('2026-08-08');
const UPDATED_AT = new Date('2026-08-08T08:05:00.000Z');

class TestWalkRepository implements WalkRepository {
  readonly #walks = new Map<string, Walk>();
  public rejectUpdate = false;
  public updateCount = 0;

  public constructor(walks: readonly Walk[] = []) {
    for (const walk of walks) this.#walks.set(walk.id.toString(), walk);
  }

  public async findById(id: EntityIdType): Promise<Walk | null> {
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

  public async startIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<StartWalkPersistenceResult> {
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return 'versionConflict';
    this.#walks.set(walk.id.toString(), walk);
    return 'saved';
  }

  public async updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean> {
    this.updateCount += 1;
    if (this.rejectUpdate) return false;
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return false;
    this.#walks.set(walk.id.toString(), walk);
    return true;
  }

  public async deleteIfVersionMatches(id: EntityIdType, expectedVersion: number): Promise<boolean> {
    const stored = this.#walks.get(id.toString());
    return stored?.version === expectedVersion && this.#walks.delete(id.toString());
  }
}

describe('walk reflection commands', () => {
  it('advances the active reflection walk through the existing repository', async () => {
    const walk = activeReflectionWalk('advance');
    const repository = new TestWalkRepository([walk]);

    const result = await new AdvanceWalkReflectionStage(
      repository,
      new FakeClock(UPDATED_AT),
    ).execute({ walkId: walk.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        reflectionStage: WALK_REFLECTION_STAGE.assumptions,
        status: WALK_STATUS.running,
      },
    });
    if (!result.ok) throw result.error;
    expect(result.value.updatedAt).toEqual(UPDATED_AT);
    await expect(repository.findById(walk.id)).resolves.toBe(result.value);
  });

  it('disables guidance and treats a repeated disable as idempotent', async () => {
    const walk = activeReflectionWalk('disable');
    const repository = new TestWalkRepository([walk]);
    const command = new DisableWalkReflectionGuidance(repository, new FakeClock(UPDATED_AT));

    const disabled = await command.execute({ walkId: walk.id });
    expect(disabled).toMatchObject({ ok: true, value: { reflectionStage: null } });
    if (!disabled.ok) throw disabled.error;
    const repeated = await command.execute({ walkId: walk.id });

    expect(repeated).toEqual({ ok: true, value: disabled.value });
    expect(repository.updateCount).toBe(1);
  });

  it.each([
    ['advance', AdvanceWalkReflectionStage],
    ['disable', DisableWalkReflectionGuidance],
  ] as const)('returns walk.not_found from %s', async (_name, Command) => {
    const result = await new Command(new TestWalkRepository(), new FakeClock(UPDATED_AT)).execute({
      walkId: EntityId.create('missing-walk'),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'walk.not_found' } });
  });

  it.each([
    ['advance', AdvanceWalkReflectionStage],
    ['disable', DisableWalkReflectionGuidance],
  ] as const)(
    'returns the domain error when %s is requested before start',
    async (_name, Command) => {
      const planned = reflectionWalk(`planned-${_name}`);
      const result = await new Command(
        new TestWalkRepository([planned]),
        new FakeClock(UPDATED_AT),
      ).execute({ walkId: planned.id });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'walk.reflection_requires_active' },
      });
    },
  );

  it.each([
    ['advance', AdvanceWalkReflectionStage],
    ['disable', DisableWalkReflectionGuidance],
  ] as const)(
    'returns walk.version_conflict when %s loses the optimistic update',
    async (_name, Command) => {
      const walk = activeReflectionWalk(`conflict-${_name}`);
      const repository = new TestWalkRepository([walk]);
      repository.rejectUpdate = true;

      const result = await new Command(repository, new FakeClock(UPDATED_AT)).execute({
        walkId: walk.id,
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'walk.version_conflict' } });
    },
  );
});

function reflectionWalk(id: string): Walk {
  return Walk.create({
    id: EntityId.create(`walk-reflection-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    intent: WALK_INTENT.reflection,
    reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
    now: new Date('2026-08-08T08:00:00.000Z'),
  });
}

function activeReflectionWalk(id: string): Walk {
  return reflectionWalk(id).start({
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-08T08:01:00.000Z'),
    reflectionQuestion: 'Что важно обдумать?',
  });
}
