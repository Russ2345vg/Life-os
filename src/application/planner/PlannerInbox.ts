import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { inboxIdea } from '../../domain/planner/InboxIdea';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { PlannerRepository } from '../ports/PlannerRepository';

export class PlannerInbox {
  constructor(
    readonly repository: PlannerRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}
  list() {
    return this.repository.listInbox();
  }
  async capture(input: { readonly title: string; readonly note?: string }) {
    const now = this.clock.now().toISOString();
    const idea = inboxIdea({
      id: this.ids.generate().toString(),
      title: input.title,
      note: input.note ?? null,
      status: 'inbox',
      targetId: null,
      targetType: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      schemaVersion: 1,
    });
    await this.repository.createInbox(idea);
    return idea;
  }
  archive(id: string) {
    return this.repository.changeInbox(id, (current) => {
      if (current.status === 'converted')
        throw new DomainError('inbox.converted', 'Запись уже преобразована.');
      return {
        idea:
          current.status === 'archived'
            ? current
            : inboxIdea({
                ...current,
                status: 'archived',
                updatedAt: this.clock.now().toISOString(),
                version: current.version + 1,
              }),
      };
    });
  }
  convert(id: string, targetType: 'goal' | 'action') {
    return this.repository.changeInbox(id, (current) => {
      if (current.status === 'converted') {
        if (current.targetType !== targetType)
          throw new DomainError(
            'inbox.already_converted',
            'Запись уже преобразована в другую сущность.',
          );
        return { idea: current };
      }
      if (current.status !== 'inbox')
        throw new DomainError('inbox.archived', 'Запись находится в архиве.');
      const now = this.clock.now();
      const targetId = EntityId.create(`inbox-result:${targetType}:${current.id}`);
      const idea = inboxIdea({
        ...current,
        status: 'converted',
        targetType,
        targetId: targetId.toString(),
        updatedAt: now.toISOString(),
        version: current.version + 1,
      });
      if (targetType === 'goal')
        return {
          idea,
          goal: Goal.create({
            id: targetId,
            title: current.title,
            description: current.note,
            status: 'active',
            now,
          }),
        };
      return {
        idea,
        action: LifeAction.createDraft({
          id: targetId,
          title: LifeActionTitle.create(current.title),
          ...(current.note === null ? {} : { description: current.note }),
          createdAt: now,
          eventId: this.ids.generate(),
        }),
      };
    });
  }
}
