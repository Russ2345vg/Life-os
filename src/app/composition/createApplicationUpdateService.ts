import { ApplicationUpdateService } from '../../application/updates/ApplicationUpdateService';
import { TauriApplicationUpdateGateway } from '../../infrastructure/updates/TauriApplicationUpdateGateway';

export function createApplicationUpdateService(): ApplicationUpdateService {
  return new ApplicationUpdateService(new TauriApplicationUpdateGateway());
}
