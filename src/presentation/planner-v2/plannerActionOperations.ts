import type { PlannerLibraryServices } from '../../application/planner/PlannerLibraryServices';
import { EntityId, type LifeAction } from '../../domain';
import { planPlannerAction } from './plannerTodayCommands';
import type { SetActionTime } from './PlannerActionTimeSheet';
import type { EntityMenuAction } from './EntityContextMenu';
import type { CompletionTarget } from './PlannerActionCompletion';

export interface PlannerActionOperations {
  readonly busy: boolean;
  readonly onOpenAction?: ((id: string) => void) | undefined;
  readonly onComplete: (id: string) => void;
  readonly onPlan: (id: string, date: string, main?: boolean) => Promise<void>;
  readonly onLink: (id: string, goalId: string, directionId: string) => Promise<void>;
  readonly menuForAction?: ((action: LifeAction) => readonly EntityMenuAction[]) | undefined;
  readonly onReopen?: ((id: string) => Promise<void>) | undefined;
  readonly onEdit?:
    | ((action: LifeAction, title: string, description: string, need?: string) => Promise<void>)
    | undefined;
  readonly onUnlink?: ((id: string) => Promise<void>) | undefined;
}

export function createPlannerActionOperations(input: {
  readonly services: PlannerLibraryServices;
  readonly actions: () => readonly LifeAction[];
  readonly busy: boolean;
  readonly run: (work: () => Promise<unknown>, message: string | null) => Promise<void>;
  readonly changeDate: (id: string, date: string) => Promise<LifeAction>;
  readonly complete: (target: CompletionTarget) => Promise<void>;
  readonly menuForAction?: (action: LifeAction) => readonly EntityMenuAction[];
  readonly onOpenAction?: (id: string) => void;
}): PlannerActionOperations & { readonly onSetTime?: SetActionTime | undefined } {
  const selected = (id: string) => input.actions().find((action) => action.id.toString() === id);
  const onSetTime: SetActionTime | undefined = input.services.setLifeActionTime
    ? async (
        id,
        estimateMinutes,
        scheduledStartMinute,
        scheduledDurationMinutes,
        expectedVersion,
      ) => {
        await input.run(async () => {
          const result = await input.services.setLifeActionTime!.execute({
            lifeActionId: EntityId.create(id),
            estimateMinutes,
            scheduledStartMinute,
            scheduledDurationMinutes,
            expectedVersion,
          });
          if (!result.ok) throw result.error;
        }, 'Время действия сохранено');
      }
    : undefined;
  return {
    busy: input.busy,
    onOpenAction: input.onOpenAction,
    menuForAction: input.menuForAction,
    onSetTime,
    onComplete: (id) => {
      const action = selected(id);
      if (action) void input.complete({ actionId: id, completionKey: action.completionKey });
    },
    onPlan: async (id, date, main) => {
      await input.run(
        () =>
          main !== undefined
            ? planPlannerAction(input.services.setLifeActionPlan, id, date, main)
            : selected(id)?.status === 'completed'
              ? planPlannerAction(input.services.setLifeActionPlan, id, date, undefined, [
                  'completed',
                ])
              : input.changeDate(id, date),
        main === undefined ? null : 'План сохранён',
      );
    },
    onLink: async (id, goalId, directionId) => {
      await input.run(async () => {
        const result = await input.services.setLifeActionGoal.execute({
          lifeActionId: EntityId.create(id),
          goalId: goalId ? EntityId.create(goalId) : null,
          directionId: directionId ? EntityId.create(directionId) : null,
        });
        if (!result.ok) throw result.error;
      }, 'Связь с целью сохранена');
    },
    onEdit: async (action, title, description, need) => {
      await input.run(async () => {
        const details = {
          lifeActionId: action.id,
          title,
          description,
          ...(need === undefined ? {} : { need }),
        };
        const result =
          action.status === 'draft'
            ? await input.services.editPlannerActionDraft.execute(details)
            : await input.services.updateLifeActionDetails.execute({
                ...details,
                expectedResult: action.expectedResult?.toString() ?? '',
              });
        if (!result.ok) throw result.error;
      }, 'Действие изменено');
    },
    onReopen: input.services.planning
      ? async (id) => {
          await input.run(
            () => input.services.planning!.progress.reopen(id),
            'Действие возвращено в работу',
          );
        }
      : undefined,
    onUnlink: async (id) => {
      await input.run(async () => {
        const result = await input.services.setLifeActionParent.execute({
          lifeActionId: EntityId.create(id),
          parentActionId: null,
        });
        if (!result.ok) throw result.error;
      }, 'Поддействие отделено');
    },
  };
}
