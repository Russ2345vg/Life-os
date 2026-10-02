import { DayDate, EntityId, LifeActionTitle } from '../../domain';
import type { CreateLifeActionDraft } from '../commands/CreateLifeActionDraft';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { WalkExportReservations } from './WalkMemoryExport';
import { WalkCommands, walkRequest } from './WalkCommands';
import { DomainError } from '../../shared/errors/DomainError';
export class WalkPlanning {
  public constructor(
    private readonly create: CreateLifeActionDraft,
    private readonly unit: JournalUnitOfWork,
    private readonly actions: LifeActionRepository,
    private readonly reservations: WalkExportReservations,
    private readonly walks: WalkCommands,
  ) {}
  public async plan(input: {
    requestId: string;
    date: string;
    targetMinutes: number | null;
    recurrence: 'once' | 'daily' | 'weekdays';
  }) {
    const plannedDate = DayDate.create(input.date);
    const identity = EntityId.create(
      await this.reservations.reserveExport(
        walkRequest('planWalk', input),
        `walk-plan:${input.requestId}`,
      ),
    );
    if (await this.actions.findById(identity)) return { actionId: identity.toString() };
    const prepared = await this.create.prepare(
      {
        title: LifeActionTitle.create('Прогулка'),
        plannedDate,
        walkPlan: { kind: 'walk', targetMinutes: input.targetMinutes },
        recurrence:
          input.recurrence === 'once'
            ? null
            : {
                title: 'Прогулка',
                goalId: null,
                priority: null,
                startDate: input.date,
                endDate: null,
                maxCompletions: null,
                paused: false,
                pauseUntil: null,
                schedule:
                  input.recurrence === 'daily'
                    ? { kind: 'daily' }
                    : { kind: 'weekdays', weekdays: [1, 2, 3, 4, 5] },
              },
      },
      identity,
    );
    if (!prepared.ok) throw prepared.error;
    try {
      await this.unit.commit(prepared.value.commit);
    } catch (error: unknown) {
      if (!(await this.actions.findById(identity))) throw error;
    }
    return { actionId: identity.toString() };
  }
  public async list() {
    if (!this.actions.findAll)
      throw new DomainError('walk.planning_unavailable', 'Не удалось загрузить планы.');
    return (await this.actions.findAll())
      .filter(
        (action) =>
          action.walkPlan &&
          !action.isArchived() &&
          !action.isDeleted() &&
          !['completed', 'cancelled'].includes(action.status),
      )
      .sort((a, b) =>
        (a.plannedDate?.toString() ?? '').localeCompare(b.plannedDate?.toString() ?? ''),
      );
  }
  public startPlanned(input: { actionId: string; requestId: string }) {
    return this.walks.start({
      requestId: input.requestId,
      linkedEntity: { type: 'lifeAction', id: input.actionId },
      usePlannedSettings: true,
      intent: 'free',
      type: 'restorative',
      mode: 'stopwatch',
      targetMinutes: null,
      question: null,
      sphereId: null,
      beforeState: null,
    });
  }
}
