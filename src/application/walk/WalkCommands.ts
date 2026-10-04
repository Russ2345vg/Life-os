import { Walk } from '../../domain/walk/Walk';
import { EntityId } from '../../domain/shared/EntityId';
import type { WalkIntent } from '../../domain/walk/WalkIntent';
import type { WalkType } from '../../domain/walk/WalkType';
import type { WalkMode } from '../../domain/walk/WalkMode';
import type { WalkStateSnapshot } from '../../domain/walk/WalkStateSnapshot';
import type { WalkReflectionTemplate } from '../../domain/walk/WalkReflectionTemplate';
import type { WalkReflectionData } from '../../domain/walk/WalkReflection';
import type { WalkPhoto } from '../../domain/walk/WalkPhoto';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { IdGenerator } from '../ports/IdGenerator';
import type { WalkUnitOfWork } from '../ports/WalkUnitOfWork';
import { DomainError } from '../../shared/errors/DomainError';

export interface WalkCommandTarget {
  readonly walkId: string;
  readonly expectedVersion: number;
  readonly requestId: string;
}
export interface StartWalkInput {
  readonly linkedEntity?: { readonly type: 'goal' | 'lifeAction'; readonly id: string };
  readonly usePlannedSettings?: boolean;
  readonly origin?: 'today' | 'walks';
  readonly requestId: string;
  readonly intent: WalkIntent;
  readonly type: WalkType;
  readonly mode: WalkMode;
  readonly question: string | null;
  readonly targetMinutes: number | null;
  readonly sphereId: string | null;
  readonly beforeState: WalkStateSnapshot | null;
  readonly reflectionTemplate?: WalkReflectionTemplate | null;
}

export class WalkCommands {
  public constructor(
    private readonly unit: WalkUnitOfWork,
    private readonly clock: Clock,
    private readonly dates: CurrentDateProvider,
    private readonly ids: IdGenerator,
  ) {}

  public start(input: StartWalkInput): Promise<Walk> {
    return this.unit.run(walkRequest('start', input), async (tx) => {
      if ((await tx.getActive()).length) throw activeExists();
      let mode = input.mode;
      let targetMinutes = input.targetMinutes;
      if (input.linkedEntity?.type === 'lifeAction') {
        const action = await tx.getAction(input.linkedEntity.id);
        if (
          !action ||
          action.isDeleted() ||
          action.isArchived() ||
          !['draft', 'ready', 'inProgress'].includes(action.status)
        )
          throw new DomainError('walk.context_unavailable', 'Связанное действие недоступно.');
        if (input.usePlannedSettings) {
          if (!action.walkPlan)
            throw new DomainError('walk.plan_missing', 'Это действие не является планом прогулки.');
          targetMinutes = action.walkPlan.targetMinutes;
          mode = targetMinutes === null ? 'stopwatch' : 'timer';
        }
      } else if (input.linkedEntity?.type === 'goal' && !(await tx.hasGoal(input.linkedEntity.id)))
        throw new DomainError('walk.context_unavailable', 'Связанная цель недоступна.');
      const linkedEntity = input.linkedEntity
        ? { type: input.linkedEntity.type, id: EntityId.create(input.linkedEntity.id) }
        : null;
      const now = this.clock.now();
      const walk = Walk.create({
        id: this.ids.generate(),
        date: this.dates.getCurrentDate(),
        type: input.type,
        intent: input.intent,
        sphereId: input.sphereId === null ? null : EntityId.create(input.sphereId),
        linkedEntity,
        returnContext: {
          origin: linkedEntity?.type ?? input.origin ?? 'walks',
          entity: linkedEntity,
          nextStep: null,
        },
        beforeState: input.beforeState,
        reflectionTemplate: input.reflectionTemplate ?? null,
        now,
      }).start({
        mode,
        reflectionQuestion: input.question,
        startedAt: now,
        ...(targetMinutes === null ? {} : { timerTargetMinutes: targetMinutes }),
      });
      await tx.saveWalk(walk, null);
      return walk;
    });
  }

  public startExisting(
    input: WalkCommandTarget & {
      mode: WalkMode;
      question: string | null;
      targetMinutes: number | null;
    },
  ): Promise<Walk> {
    return this.unit.run(walkRequest('startExisting', input), async (tx) => {
      const current = await tx.getWalk(input.walkId);
      assertCurrent(current, input.expectedVersion);
      if ((await tx.getActive()).some((walk) => walk.id.toString() !== input.walkId))
        throw activeExists();
      const next = current.start({
        mode: input.mode,
        startedAt: this.clock.now(),
        reflectionQuestion: input.question,
        ...(input.targetMinutes === null ? {} : { timerTargetMinutes: input.targetMinutes }),
      });
      await tx.saveWalk(next, current.version);
      return next;
    });
  }

  public pause(input: WalkCommandTarget): Promise<Walk> {
    return this.change('pause', input, (walk) => walk.pause(this.clock.now()));
  }
  public resume(input: WalkCommandTarget): Promise<Walk> {
    return this.change('resume', input, (walk) => walk.resume(this.clock.now()));
  }
  public complete(input: WalkCommandTarget): Promise<Walk> {
    return this.change('complete', input, (walk) => walk.complete({ endedAt: this.clock.now() }));
  }
  public abandon(input: WalkCommandTarget): Promise<Walk> {
    return this.change('abandon', input, (walk) => walk.abandon(this.clock.now()));
  }
  public advance(input: WalkCommandTarget): Promise<Walk> {
    return this.change('advance', input, (walk) => walk.advanceReflectionStage(this.clock.now()));
  }
  public disable(input: WalkCommandTarget): Promise<Walk> {
    return this.change('disable', input, (walk) =>
      walk.disableReflectionGuidance(this.clock.now()),
    );
  }
  public remove(input: WalkCommandTarget): Promise<Walk> {
    return this.change('remove', input, (walk) => walk.remove(this.clock.now()));
  }
  public restore(input: WalkCommandTarget): Promise<Walk> {
    return this.change('restore', input, (walk) => walk.restore(this.clock.now()));
  }
  public updatePhoto(input: WalkCommandTarget & { photo: WalkPhoto | null }): Promise<Walk> {
    return this.change('updatePhoto', input, (walk) =>
      walk.updatePhoto({ photo: input.photo, updatedAt: this.clock.now() }),
    );
  }
  public saveReflection(
    input: WalkCommandTarget & { reflection: Partial<Omit<WalkReflectionData, 'updatedAt'>> },
  ): Promise<Walk> {
    return this.change('saveReflection', input, (walk) =>
      walk.reviseReflection({
        result: input.reflection.result === undefined ? walk.result : input.reflection.result,
        afterState:
          input.reflection.afterState === undefined ? walk.afterState : input.reflection.afterState,
        impact: input.reflection.impact === undefined ? walk.impact : input.reflection.impact,
        notes: input.reflection.notes === undefined ? walk.reflectionNotes : input.reflection.notes,
        updatedAt: this.clock.now(),
      }),
    );
  }
  private change(
    operation: string,
    input: WalkCommandTarget,
    transition: (walk: Walk) => Walk,
  ): Promise<Walk> {
    return this.unit.run(walkRequest(operation, input), async (tx) => {
      const current = await tx.getWalk(input.walkId);
      assertCurrent(current, input.expectedVersion);
      const next = transition(current);
      if (current.deletedAt !== null && operation !== 'restore' && operation !== 'remove')
        throw new DomainError('walk.deleted', 'Сначала восстановите прогулку.');
      if (next !== current) await tx.saveWalk(next, current.version);
      return next;
    });
  }
}

export function assertCurrent<T extends { readonly version: number }>(
  current: T | null,
  version: number,
): asserts current is T {
  if (current === null) throw new DomainError('walk.not_found', 'Прогулка или мысль не найдена.');
  if (current.version !== version)
    throw new DomainError(
      'persistence.version_conflict',
      'Запись изменилась. Обновите данные перед сохранением.',
    );
}
export function walkRequest(operation: string, input: { readonly requestId: string }) {
  if (!input.requestId.trim() || input.requestId.length > 200)
    throw new DomainError(
      'walk.invalid_request',
      'Не удалось определить команду. Повторите действие.',
    );
  return { requestId: input.requestId, operation, inputHash: JSON.stringify(canonical(input)) };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function activeExists() {
  return new DomainError(
    'walk.active_exists',
    'Уже есть активная прогулка. Продолжите или завершите её.',
  );
}
