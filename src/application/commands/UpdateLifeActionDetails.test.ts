import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, LIFE_ACTION_STATUS, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { UpdateLifeActionDetails } from './UpdateLifeActionDetails';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T12:00:00.000+09:00');

describe('UpdateLifeActionDetails', () => {
  it('редактирует ready-действие, нормализует поля и сохраняет только изменяемые сведения', async () => {
    const action = createReadyLifeAction('editable', DATE, {
      decisionId: EntityId.create('decision-editable'),
      description: 'Старое описание',
    });
    const before = stableSnapshot(action);
    const version = action.version;
    const context = createContext(action);

    const result = await context.command.execute({
      lifeActionId: action.id,
      title: '  Новое название  ',
      description: '  Новое описание  ',
      expectedResult: '  Новый ожидаемый результат  ',
    });

    expect(result.ok).toBe(true);
    expect(action.title.toString()).toBe('Новое название');
    expect(action.description).toBe('Новое описание');
    expect(action.expectedResult?.toString()).toBe('Новый ожидаемый результат');
    expect(stableSnapshot(action)).toEqual(before);
    expect(action.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(action.version).toBe(version + 1);
    expect(context.repository.saveCount).toBe(1);
  });

  it('создаёт action.details_updated с временем Clock и id из IdGenerator', async () => {
    const action = createReadyLifeAction('event', DATE);
    action.clearUncommittedEvents();
    const context = createContext(action);

    await context.command.execute({
      lifeActionId: action.id,
      title: 'Изменённое действие',
      description: '',
      expectedResult: 'Изменённый результат',
    });

    expect(action.getUncommittedEvents()).toHaveLength(1);
    expect(action.getUncommittedEvents()[0]).toMatchObject({
      eventType: 'action.details_updated',
      eventId: EntityId.create('action-details-event-1'),
    });
    expect(action.getUncommittedEvents()[0]?.occurredAt).toEqual(NOW);
    expect(context.idGenerator.generatedCount).toBe(1);
  });

  it('разрешает очистить описание', async () => {
    const action = createReadyLifeAction('clear-description', DATE, { description: 'Описание' });
    const context = createContext(action);

    const result = await context.command.execute({
      lifeActionId: action.id,
      title: action.title.toString(),
      description: '   ',
      expectedResult: action.expectedResult!.toString(),
    });

    expect(result.ok).toBe(true);
    expect(action.description).toBeNull();
    expect(context.repository.saveCount).toBe(1);
  });

  it('одинаковые нормализованные данные идемпотентны', async () => {
    const action = createReadyLifeAction('same', DATE, { description: 'Описание' });
    action.clearUncommittedEvents();
    const context = createContext(action);
    const version = action.version;

    const result = await context.command.execute({
      lifeActionId: action.id,
      title: `  ${action.title.toString()}  `,
      description: '  Описание  ',
      expectedResult: `  ${action.expectedResult!.toString()}  `,
    });

    expect(result.ok).toBe(true);
    expect(action.version).toBe(version);
    expect(action.getUncommittedEvents()).toHaveLength(0);
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('возвращает action.not_found', async () => {
    const context = createContext(null);
    const result = await context.command.execute({
      lifeActionId: EntityId.create('missing'),
      title: 'Название',
      expectedResult: 'Результат',
    });

    expectFailure(result, 'action.not_found');
  });

  it.each([
    ['draft', createLifeActionDraft('draft')],
    ['in_progress', markLifeActionInProgress(createReadyLifeAction('progress', DATE))],
    ['completed', completeLifeAction(createReadyLifeAction('completed', DATE))],
    ['cancelled', cancelLifeAction(createReadyLifeAction('cancelled', DATE))],
    ['archived', archiveLifeAction(completeLifeAction(createReadyLifeAction('archived', DATE)))],
  ])('запрещает редактирование %s-действия', async (_label, action) => {
    const context = createContext(action);
    const result = await context.command.execute({
      lifeActionId: action.id,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });

    expectFailure(result, 'action.cannot_edit');
    expect(context.repository.saveCount).toBe(0);
  });

  it.each([
    ['title', '   ', 'Результат', 'action.title_required'],
    ['expectedResult', 'Название', '   ', 'action.expected_result_required'],
  ])('запрещает пустое поле %s без сохранения', async (_label, title, expectedResult, code) => {
    const action = createReadyLifeAction(`empty-${_label}`, DATE);
    const version = action.version;
    const context = createContext(action);
    const result = await context.command.execute({
      lifeActionId: action.id,
      title,
      expectedResult,
    });

    expectFailure(result, code);
    expect(action.version).toBe(version);
    expect(context.repository.saveCount).toBe(0);
  });

  it('не сохраняет действие при ошибке value object', async () => {
    const action = createReadyLifeAction('invalid', DATE);
    const version = action.version;
    const context = createContext(action);
    const result = await context.command.execute({
      lifeActionId: action.id,
      title: 'x'.repeat(201),
      expectedResult: 'Результат',
    });

    expect(result.ok).toBe(false);
    expect(action.version).toBe(version);
    expect(context.repository.saveCount).toBe(0);
  });
});

function stableSnapshot(action: LifeAction) {
  return {
    decisionId: action.decisionId?.toString() ?? null,
    plannedDate: action.plannedDate?.toString() ?? null,
    status: action.status,
    createdAt: action.createdAt,
    readyAt: action.readyAt,
  } as const;
}

function createContext(action: LifeAction | null) {
  const repository = new TrackingLifeActionRepository(action);
  const idGenerator = new FakeIdGenerator('action-details-event');
  return {
    repository,
    idGenerator,
    command: new UpdateLifeActionDetails(repository, new FakeClock(NOW), idGenerator),
  };
}

class TrackingLifeActionRepository implements LifeActionRepository {
  readonly #action: LifeAction | null;
  public saveCount = 0;

  public constructor(action: LifeAction | null) {
    this.#action = action;
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#action?.id.equals(id) ? this.#action : null;
  }

  public async findByDate(): Promise<readonly LifeAction[]> {
    return this.#action === null ? [] : [this.#action];
  }

  public async findByDecisionId(): Promise<readonly LifeAction[]> {
    return this.#action === null ? [] : [this.#action];
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

function expectFailure(
  result: Awaited<ReturnType<UpdateLifeActionDetails['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
