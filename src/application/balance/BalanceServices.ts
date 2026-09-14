import type { GetLifeBalance } from './GetLifeBalance';
import type { BalanceIndicators } from './BalanceIndicators';
import type { CreateSphere } from '../commands/CreateSphere';
import type { UpdateSphere } from '../commands/UpdateSphere';
import type { CreateDirection } from '../commands/CreateDirection';
import type { UpdateDirection } from '../commands/UpdateDirection';
export interface BalanceServices {
  readonly read: Pick<GetLifeBalance, 'execute'>;
  readonly indicators: Pick<BalanceIndicators, 'save' | 'remove'>;
  readonly createSphere: Pick<CreateSphere, 'execute'>;
  readonly updateSphere: Pick<UpdateSphere, 'execute'>;
  readonly createDirection: Pick<CreateDirection, 'execute'>;
  readonly updateDirection: Pick<UpdateDirection, 'execute'>;
  refreshSnapshots(): Promise<void>;
}
