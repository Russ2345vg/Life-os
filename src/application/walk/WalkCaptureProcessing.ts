import { EntityId, LifeActionTitle } from '../../domain';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type { CreateLifeActionDraft } from '../commands/CreateLifeActionDraft';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { Clock } from '../ports/Clock';
import { DomainError } from '../../shared/errors/DomainError';
import { walkRequest } from './WalkCommands';
export class WalkCaptureProcessing {
  public constructor(
    private readonly captures: WalkCaptureRepository,
    private readonly create: CreateLifeActionDraft,
    private readonly unit: JournalUnitOfWork,
    private readonly clock: Clock,
  ) {}
  public async createAction(input: {
    captureId: string;
    expectedVersion: number;
    requestId: string;
    title: string;
  }): Promise<{ actionId: string }> {
    const capture = (await this.captures.listCaptures()).find(
      (item) => item.id.toString() === input.captureId,
    );
    if (!capture) throw new DomainError('walk_capture.not_found', 'Мысль не найдена.');
    const actionId = EntityId.create(`action-from-walk-capture:${input.captureId}`);
    const prepared = await this.create.prepare(
      { title: LifeActionTitle.create(input.title), description: capture.content },
      actionId,
    );
    if (!prepared.ok) throw prepared.error;
    await this.unit.commit({
      ...prepared.value.commit,
      walkCaptureAction: {
        capture: capture.processAsAction(actionId, this.clock.now()),
        expectedVersion: input.expectedVersion,
        request: walkRequest('captureAction', input),
      },
    });
    return { actionId: actionId.toString() };
  }
}
