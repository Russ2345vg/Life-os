import type { GetLifeBalance } from './GetLifeBalance';
import type { BalanceIndicators } from './BalanceIndicators';
import type { CreateSphere } from '../commands/CreateSphere';
import type { UpdateSphere } from '../commands/UpdateSphere';
import type { CreateDirection } from '../commands/CreateDirection';
import type { UpdateDirection } from '../commands/UpdateDirection';
import type { ArchiveSphere } from '../commands/ArchiveSphere';
import type { ArchiveDirection } from '../commands/ArchiveDirection';
import type { RestoreSphere } from '../commands/RestoreSphere';
import type { RestoreDirection } from '../commands/RestoreDirection';
import type { DeletePilotSphere } from '../sync/pilot/DeletePilotSphere';
import type { DeletePilotDirection } from '../sync/pilot/DeletePilotDirection';
export interface BalanceServices {
  readonly read: Pick<GetLifeBalance, 'execute'>;
  readonly indicators: Pick<BalanceIndicators, 'save' | 'remove'>;
  readonly createSphere: Pick<CreateSphere, 'execute'>;
  readonly updateSphere: Pick<UpdateSphere, 'execute'>;
  readonly createDirection: Pick<CreateDirection, 'execute'>;
  readonly updateDirection: Pick<UpdateDirection, 'execute'>;
  readonly archiveSphere: Pick<ArchiveSphere, 'execute'>;
  readonly archiveDirection: Pick<ArchiveDirection, 'execute'>;
  readonly restoreSphere: Pick<RestoreSphere, 'execute'>;
  readonly restoreDirection: Pick<RestoreDirection, 'execute'>;
  readonly deletePilotSphere: Pick<DeletePilotSphere, 'execute'>;
  readonly deletePilotDirection: Pick<DeletePilotDirection, 'execute'>;
  refreshSnapshots(): Promise<void>;
}
