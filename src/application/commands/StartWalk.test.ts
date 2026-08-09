import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_MODE,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type EntityId as EntityIdType,
} from '../../domain';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import type { StartWalkPersistenceResult, WalkRepository } from '../ports/WalkRepository';
import { WALK_REFLECTION_QUESTIONS } from '../walk/WalkReflectionQuestions';
import { DeleteWalk } from './DeleteWalk';
import { StartWalk } from './StartWalk';

const TODAY = DayDate.create('2026-08-08');
const STARTED_AT = new Date('2026-08-08T08:00:00.000Z');

class TestWalkRepository implements WalkRepository {
  readonly #walks = new Map<string, Walk>();

  public constructor(walks: readonly Walk[]) {
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

  public async save(walk: Walk): Promise<void> {
    this.#walks.set(walk.id.toString(), walk);
  }

  public async startIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<StartWalkPersistenceResult> {
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return 'versionConflict';
    if ([...this.#walks.values()].some((item) => item.status === WALK_STATUS.running)) {
      return 'runningExists';
    }
    this.#walks.set(walk.id.toString(), walk);
    return 'saved';
  }

  public async deleteIfVersionMatches(id: EntityIdType, expectedVersion: number): Promise<boolean> {
    const walk = this.#walks.get(id.toString());
    return walk?.version === expectedVersion && this.#walks.delete(id.toString());
  }

  public async updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean> {
    const stored = this.#walks.get(walk.id.toString());
    if (stored?.version !== expectedVersion) return false;
    this.#walks.set(walk.id.toString(), walk);
    return true;
  }
}

describe('StartWalk', () => {
  it('uses a local neutral set containing at least ten questions', () => {
    expect(WALK_REFLECTION_QUESTIONS).toHaveLength(10);
    expect(new Set(WALK_REFLECTION_QUESTIONS).size).toBe(10);
  });

  it('starts a stopwatch and fixes time, mode and one reflection question', async () => {
    const walk = plannedWalk('stopwatch');
    const repository = new TestWalkRepository([walk]);
    const picker = vi.fn(() => 'Что сейчас важно заметить?');
    const command = commandFor(repository, picker);

    const result = await command.execute({ walkId: walk.id, mode: WALK_MODE.stopwatch });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: WALK_STATUS.running,
        mode: WALK_MODE.stopwatch,
        timerTargetMinutes: null,
        reflectionQuestion: 'Что сейчас важно заметить?',
        version: 2,
      },
    });
    if (!result.ok) throw result.error;
    expect(result.value.startedAt).toEqual(STARTED_AT);
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('starts a timer with a persisted target duration', async () => {
    const walk = plannedWalk('timer');
    const repository = new TestWalkRepository([walk]);
    const result = await commandFor(repository).execute({
      walkId: walk.id,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 45,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { mode: WALK_MODE.timer, timerTargetMinutes: 45 },
    });
  });

  it.each([0, 1.5, 1441])(
    'rejects invalid timer duration %s without changing the walk',
    async (duration) => {
      const walk = plannedWalk(`invalid-${duration}`);
      const repository = new TestWalkRepository([walk]);
      const result = await commandFor(repository).execute({
        walkId: walk.id,
        mode: WALK_MODE.timer,
        timerTargetMinutes: duration,
      });

      expect(result).toMatchObject({ ok: false, error: { code: 'walk.invalid_timer_target' } });
      expect(await repository.findById(walk.id)).toBe(walk);
    },
  );

  it('rejects a timer without duration', async () => {
    const walk = plannedWalk('missing-duration');
    const result = await commandFor(new TestWalkRepository([walk])).execute({
      walkId: walk.id,
      mode: WALK_MODE.timer,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'walk.invalid_timer_target' } });
  });

  it('deduplicates concurrent and repeated start without changing start data', async () => {
    const walk = plannedWalk('double');
    const repository = new TestWalkRepository([walk]);
    const clock = new FakeClock(STARTED_AT);
    const picker = vi.fn(() => 'Один вопрос');
    const command = new StartWalk(repository, new FakeCurrentDateProvider(TODAY), clock, picker);

    const [first, second] = await Promise.all([
      command.execute({ walkId: walk.id, mode: WALK_MODE.stopwatch }),
      command.execute({ walkId: walk.id, mode: WALK_MODE.timer, timerTargetMinutes: 20 }),
    ]);
    clock.setTime(new Date('2026-08-08T09:00:00.000Z'));
    const repeated = await command.execute({
      walkId: walk.id,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 60,
    });

    expect(first).toMatchObject({ ok: true, value: { mode: WALK_MODE.stopwatch, version: 2 } });
    expect(second).toBe(first);
    expect(repeated).toMatchObject({
      ok: true,
      value: { mode: WALK_MODE.stopwatch, reflectionQuestion: 'Один вопрос', version: 2 },
    });
    if (!repeated.ok) throw repeated.error;
    expect(repeated.value.startedAt).toEqual(STARTED_AT);
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('does not start a second walk while another one is running', async () => {
    const first = plannedWalk('first');
    const second = plannedWalk('second');
    const repository = new TestWalkRepository([first, second]);
    const command = commandFor(repository);
    await command.execute({ walkId: first.id, mode: WALK_MODE.stopwatch });

    const result = await command.execute({ walkId: second.id, mode: WALK_MODE.stopwatch });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'walk.another_running', message: 'Сначала завершите текущую прогулку.' },
    });
    expect((await repository.findById(second.id))?.status).toBe(WALK_STATUS.planned);
  });

  it('does not allow the stage 14.1 delete command to remove a running walk', async () => {
    const walk = plannedWalk('delete-running');
    const repository = new TestWalkRepository([walk]);
    const started = await commandFor(repository).execute({
      walkId: walk.id,
      mode: WALK_MODE.stopwatch,
    });
    if (!started.ok) throw started.error;

    const result = await new DeleteWalk(repository).execute({
      id: walk.id,
      expectedVersion: started.value.version,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'walk.cannot_delete_running' },
    });
    expect((await repository.findById(walk.id))?.status).toBe(WALK_STATUS.running);
  });

  it.each([
    ['2026-08-07', 'walk.date_in_past'],
    ['2026-08-09', 'walk.date_in_future'],
  ])('rejects a walk planned for %s', async (date, code) => {
    const walk = plannedWalk(date, DayDate.create(date));
    const result = await commandFor(new TestWalkRepository([walk])).execute({
      walkId: walk.id,
      mode: WALK_MODE.stopwatch,
    });
    expect(result).toMatchObject({ ok: false, error: { code } });
  });
});

function commandFor(repository: WalkRepository, picker = () => 'Локальный вопрос'): StartWalk {
  return new StartWalk(
    repository,
    new FakeCurrentDateProvider(TODAY),
    new FakeClock(STARTED_AT),
    picker,
  );
}

function plannedWalk(id: string, date: DayDate = TODAY): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date,
    type: WALK_TYPE.mindful,
    now: new Date('2026-08-08T07:00:00.000Z'),
  });
}
