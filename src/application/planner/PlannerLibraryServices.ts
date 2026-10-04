import type { CreateLifeActionDraft } from '../commands/CreateLifeActionDraft';
import type { GetGoals } from '../queries/GetGoals';
import type { GetDirections } from '../queries/GetDirections';
import type { GetSpheres } from '../queries/GetSpheres';
import type { CompleteLifeAction } from '../commands/CompleteLifeAction';
import type { SetLifeActionGoal } from '../commands/SetLifeActionGoal';
import type { SetLifeActionPlan } from '../commands/SetLifeActionPlan';
import type { UpdateGoal } from '../commands/UpdateGoal';
import type { ArchiveGoal } from '../commands/ArchiveGoal';
import type { PlannerInbox } from './PlannerInbox';
import type { PlannerFocus } from './PlannerFocus';
import type { PlannerCatalog } from './PlannerCatalog';
import type { DeletePilotGoal } from '../sync/pilot/DeletePilotGoal';
import type { DeletePilotLifeAction } from '../sync/pilot/DeletePilotLifeAction';
import type { ArchiveLifeAction } from '../commands/ArchiveLifeAction';
import type { EditPlannerActionDraft } from '../commands/EditPlannerActionDraft';
import type { SetLifeActionParent } from '../commands/SetLifeActionParent';
import type { SetLifeActionTime } from '../commands/SetLifeActionTime';
import type { TimeCapacityService } from '../time/TimeCapacityService';
import type { WorkSessions } from '../time/WorkSessions';
import type { SelectGoalNextAction } from '../commands/SelectGoalNextAction';
import type { UpdateLifeActionDetails } from '../commands/UpdateLifeActionDetails';
import type { PlanningServices } from './PlanningServices';
import type { PlannerLibraryReadModels } from './PlannerLibraryReadModels';
import type { PlanImport } from '../plan-import/PlanImport';

export interface PlannerLibraryServices {
  readonly planImport?: Pick<PlanImport, 'preview' | 'execute'>;
  readonly libraryReads: Pick<PlannerLibraryReadModels, 'create'>;
  readonly setLifeActionTime?: Pick<SetLifeActionTime, 'execute'>;
  readonly timeCapacity?: Pick<TimeCapacityService, 'get' | 'setWeekday'>;
  readonly workSessions?: Pick<
    WorkSessions,
    'list' | 'start' | 'pause' | 'pauseAtDeadline' | 'resume' | 'finish'
  >;
  readonly createLifeActionDraft: Pick<CreateLifeActionDraft, 'execute'>;
  readonly plannerInbox: Pick<PlannerInbox, 'list' | 'capture' | 'convert' | 'archive'>;
  readonly plannerFocus: Pick<PlannerFocus, 'get' | 'setRole'>;
  readonly plannerCatalog: Pick<PlannerCatalog, 'actions'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
  readonly setLifeActionGoal: Pick<SetLifeActionGoal, 'execute'>;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
  readonly deletePilotGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly deletePilotLifeAction: Pick<DeletePilotLifeAction, 'execute'>;
  readonly archiveLifeAction: Pick<ArchiveLifeAction, 'execute'>;
  readonly editPlannerActionDraft: Pick<EditPlannerActionDraft, 'execute'>;
  readonly setLifeActionParent: Pick<SetLifeActionParent, 'execute'>;
  readonly selectGoalNextAction: Pick<SelectGoalNextAction, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly planning?: PlanningServices;
}
