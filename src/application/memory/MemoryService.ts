import type { EntityId } from '../../domain';
import {
  createMemoryEvent,
  validateMemoryEvent,
  type MemoryDraft,
  type MemoryEvent,
} from '../../domain/memory';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { IdGenerator } from '../ports/IdGenerator';
import type { MemoryRepository, MemorySaveOptions } from '../ports/MemoryRepository';
import type { MemoryContextResolver } from './MemoryContext';

export class MemoryApplicationService {
  public constructor(
    private readonly repository: MemoryRepository,
    private readonly clock: Clock,
    private readonly currentDate: CurrentDateProvider,
    private readonly ids: IdGenerator,
    public readonly enabled: boolean,
    private readonly contexts?: MemoryContextResolver,
  ) {}

  public prepareCreate(): MemoryDraft {
    return {
      id: this.ids.generate(),
      occurredOn: this.currentDate.getCurrentDate(),
      title: '',
      body: '',
      kind: 'moment',
      isHighlight: false,
      context: null,
      diarySource: null,
      photo: null,
    };
  }

  public async save(
    draft: MemoryDraft,
    expectedVersion: number | null,
    options?: MemorySaveOptions,
  ): Promise<MemoryEvent> {
    this.assertEnabled();
    const current = await this.repository.findById(draft.id);
    if (current?.deletedAt)
      throw new DomainError('memory.deleted', 'Сначала восстановите воспоминание.');
    if (
      (!current || !draft.occurredOn.equals(current.occurredOn)) &&
      draft.occurredOn.isAfter(this.currentDate.getCurrentDate())
    )
      throw new DomainError(
        'memory.future_date',
        'Дата воспоминания не может быть позднее сегодня.',
      );
    if (
      draft.context &&
      !this.contexts &&
      JSON.stringify(draft.context) !== JSON.stringify(current?.context)
    )
      throw new DomainError('memory.context_unavailable', 'Выбор связей сейчас недоступен.');
    const resolved = {
      ...draft,
      context:
        draft.context && this.contexts
          ? await this.contexts.resolve(draft.context, current?.context ?? null)
          : draft.context,
    };
    const event = current
      ? validateMemoryEvent({
          ...current,
          ...resolved,
          updatedAt: this.timestamp(current),
          version: expectedVersion ?? 0,
        })
      : createMemoryEvent(resolved, this.clock.now());
    return this.repository.save(event, expectedVersion, options);
  }

  public async remove(id: EntityId, expectedVersion: number): Promise<MemoryEvent> {
    return this.changeDeletion(id, expectedVersion, true);
  }

  public async restore(id: EntityId, expectedVersion: number): Promise<MemoryEvent> {
    return this.changeDeletion(id, expectedVersion, false);
  }

  private async changeDeletion(
    id: EntityId,
    expectedVersion: number,
    deleted: boolean,
  ): Promise<MemoryEvent> {
    this.assertEnabled();
    const current = await this.repository.findById(id);
    if (!current) throw new DomainError('memory.not_found', 'Воспоминание не найдено.');
    const updatedAt = this.timestamp(current);
    return this.repository.save(
      {
        ...current,
        updatedAt,
        version: expectedVersion,
        deletedAt: deleted ? (current.deletedAt ?? updatedAt) : null,
      },
      expectedVersion,
    );
  }

  private timestamp(current: MemoryEvent): string {
    return new Date(
      Math.max(this.clock.now().getTime(), Date.parse(current.updatedAt)),
    ).toISOString();
  }

  private assertEnabled(): void {
    if (!this.enabled)
      throw new DomainError(
        'memory.disabled',
        'Создание воспоминаний будет доступно после обновления устройств.',
      );
  }
}
