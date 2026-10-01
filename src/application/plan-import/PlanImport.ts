import { DayDate, EntityId, GOAL_HORIZON, LifeActionTitle } from '../../domain';
import { sphereNameKey } from '../../domain/sphere/Sphere';
import { CreateSphere } from '../commands/CreateSphere';
import { CreateDirection } from '../commands/CreateDirection';
import { CreateGoal } from '../commands/CreateGoal';
import { CreateLifeActionDraft } from '../commands/CreateLifeActionDraft';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { SphereRepository } from '../ports/SphereRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { GoalRepository } from '../ports/GoalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { parsePlanFile, planEntityId, type PlanFile, type PlanKind } from './PlanFile';
import type { Result } from '../../shared/result/Result';
import type { DomainError } from '../../shared/errors/DomainError';

export type PlanImportCounts = Record<PlanKind, number>;
export interface PlanImportResult {
  readonly created: PlanImportCounts;
  readonly skipped: PlanImportCounts;
  readonly error: string | null;
}
export interface PlanImportDependencies {
  readonly spheres: SphereRepository;
  readonly directions: DirectionRepository;
  readonly goals: GoalRepository;
  readonly actions: LifeActionRepository;
  readonly decisions: DecisionRepository;
  readonly unitOfWork: JournalUnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}
const counts = (): PlanImportCounts => ({ spheres: 0, directions: 0, goals: 0, actions: 0 });

/** Additive, resumable import. Existing commands own persistence, events and sync capture. */
export class PlanImport {
  #busy = false;
  constructor(private readonly deps: PlanImportDependencies) {}
  preview(source: string): PlanFile {
    return parsePlanFile(source);
  }

  async execute(source: string): Promise<PlanImportResult> {
    const plan = this.preview(source);
    if (this.#busy) throw new Error('Другой импорт ещё выполняется. Дождитесь результата.');
    this.#busy = true;
    const created = counts();
    const skipped = counts();
    let current = '';
    const id = (kind: PlanKind, key: string) => planEntityId(plan.id, kind, key);
    const generator = (entityId: EntityId): IdGenerator => {
      let first = true;
      return {
        generate: () => {
          if (first) {
            first = false;
            return entityId;
          }
          return this.deps.ids.generate();
        },
      };
    };
    const record = <T>(result: Result<T, DomainError>, kind: PlanKind) => {
      if (!result.ok) throw result.error;
      created[kind] += 1;
      return result.value;
    };
    const unavailable = () =>
      new Error(
        'Ранее добавленная запись удалена, архивирована или перемещена. Проверьте её перед продолжением.',
      );
    try {
      const { spheres, directions, goals, actions, decisions, unitOfWork, clock } = this.deps;
      const sphereIds = new Map<string, EntityId>();
      for (const row of plan.spheres) {
        current = row.name;
        // A stable sphere ID owns the mapping. Existing directions may only recover a reused sphere.
        const anchors = await Promise.all(
          plan.directions
            .filter((d) => d.sphereKey === row.key)
            .map((d) => directions.findById(id('directions', d.key))),
        );
        const anchoredIds = [
          ...new Set(anchors.flatMap((d) => (d?.sphereId ? [d.sphereId.toString()] : []))),
        ];
        if (anchoredIds.length > 1 || anchors.some((d) => d && !d.sphereId)) throw unavailable();
        let existing = await spheres.findById(id('spheres', row.key));
        if (anchoredIds[0]) {
          if (existing && existing.id.toString() !== anchoredIds[0]) throw unavailable();
          if (!existing) {
            existing = await spheres.findById(EntityId.create(anchoredIds[0]));
            if (!existing || sphereNameKey(existing.name) !== sphereNameKey(row.name))
              throw unavailable();
          }
        }
        existing ??=
          (await spheres.findAll()).find(
            (s) => sphereNameKey(s.name) === sphereNameKey(row.name),
          ) ?? null;
        if (existing) {
          if (existing.status !== 'active') throw unavailable();
          sphereIds.set(row.key, existing.id);
          skipped.spheres += 1;
          continue;
        }
        const result = await new CreateSphere(
          spheres,
          clock,
          generator(id('spheres', row.key)),
        ).execute({ name: row.name });
        if (
          !result.ok &&
          ['sphere.id_conflict', 'sphere.name_conflict'].includes(result.error.code)
        ) {
          existing =
            (await spheres.findAll()).find(
              (s) =>
                s.id.equals(id('spheres', row.key)) ||
                sphereNameKey(s.name) === sphereNameKey(row.name),
            ) ?? null;
          if (!existing || existing.status !== 'active') throw unavailable();
          sphereIds.set(row.key, existing.id);
          skipped.spheres += 1;
        } else sphereIds.set(row.key, record(result, 'spheres').id);
      }
      for (const row of plan.directions) {
        current = row.name;
        const entityId = id('directions', row.key);
        const sphereId = sphereIds.get(row.sphereKey)!;
        let existing = await directions.findById(entityId);
        if (!existing) {
          const result = await new CreateDirection(directions, clock, generator(entityId)).execute({
            name: row.name,
            sphereId,
            description: row.description,
          });
          if (result.ok) {
            record(result, 'directions');
            continue;
          }
          if (result.error.code !== 'direction.id_conflict') throw result.error;
          existing = await directions.findById(entityId);
        }
        if (!existing || existing.status === 'archived' || !existing.sphereId?.equals(sphereId))
          throw unavailable();
        skipped.directions += 1;
      }
      for (const row of plan.goals) {
        current = row.title;
        const entityId = id('goals', row.key);
        const directionId = id('directions', row.directionKey);
        let existing = await goals.findById(entityId);
        if (!existing) {
          const result = await new CreateGoal(
            goals,
            directions,
            clock,
            generator(entityId),
          ).execute({
            title: row.title,
            directionId,
            dueDate: row.dueDate,
            achievementCriteria: row.outcome,
            description: row.description,
            status: row.status,
            horizon: GOAL_HORIZON.withinYear,
          });
          if (result.ok) {
            record(result, 'goals');
            continue;
          }
          if (result.error.code !== 'goal.id_conflict') throw result.error;
          existing = await goals.findById(entityId);
        }
        if (
          !existing ||
          existing.status === 'archived' ||
          existing.isDeleted() ||
          !existing.directionId?.equals(directionId)
        )
          throw unavailable();
        skipped.goals += 1;
      }
      for (const row of plan.actions) {
        current = row.title;
        const entityId = id('actions', row.key);
        if (await actions.findById(entityId)) {
          skipped.actions += 1;
          continue;
        }
        const result = await new CreateLifeActionDraft(
          actions,
          decisions,
          clock,
          generator(entityId),
          { goalRepository: goals, directionRepository: directions, unitOfWork },
        ).execute({
          title: LifeActionTitle.create(row.title),
          description: row.description,
          goalId: id('goals', row.goalKey),
          plannedDate: row.date ? DayDate.create(row.date) : null,
        });
        // The create-only unit of work also sees tombstones; never restore or overwrite them.
        if (!result.ok && result.error.code === 'persistence.version_conflict')
          skipped.actions += 1;
        else record(result, 'actions');
      }
      return { created, skipped, error: null };
    } catch (error: unknown) {
      return {
        created,
        skipped,
        error: `${current}: ${error instanceof Error ? error.message : 'Не удалось сохранить запись. Повторите импорт.'}`,
      };
    } finally {
      this.#busy = false;
    }
  }
}
