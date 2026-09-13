import { describe, expect, it } from 'vitest';
import {
  DayDate,
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  EntityId,
  Project,
  type Decision,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveDecision,
  cancelDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { InMemoryProjectRepository } from '../../infrastructure';
import type { DecisionRepository } from '../ports/DecisionRepository';
import { UpdateDecisionDetails } from './UpdateDecisionDetails';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T12:00:00.000+09:00');

describe('UpdateDecisionDetails', () => {
  it('редактирует все разрешённые сведения planned-решения и не мутирует загруженный снимок', async () => {
    const decision = createPlannedDecision('editable', DATE, DECISION_KIND.main, 2);
    decision.clearUncommittedEvents();
    const context = createContext([decision]);
    const originalVersion = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: originalVersion,
      title: '  Новое название  ',
      reason: '  Новая причина  ',
      expectedResult: '  Новый ожидаемый результат  ',
      sphereId: EntityId.create('sphere-development'),
      price: '  Два часа  ',
      sacrifices: '  Не переключаться  ',
      priority: DECISION_PRIORITY.high,
      projectReference: '  LifeOS  ',
      kind: DECISION_KIND.main,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value).not.toBe(decision);
    expect(result.value.title.toString()).toBe('Новое название');
    expect(result.value.reason).toBe('Новая причина');
    expect(result.value.expectedResult?.toString()).toBe('Новый ожидаемый результат');
    expect(result.value.sphereId?.toString()).toBe('sphere-development');
    expect(result.value.price).toBe('Два часа');
    expect(result.value.sacrifices).toBe('Не переключаться');
    expect(result.value.priority).toBe(DECISION_PRIORITY.high);
    expect(result.value.projectReference).toBe('LifeOS');
    expect(result.value.kind).toBe(DECISION_KIND.main);
    expect(result.value.order).toBe(2);
    expect(result.value.plannedDate?.equals(DATE)).toBe(true);
    expect(result.value.status).toBe(DECISION_STATUS.planned);
    expect(result.value.version).toBe(originalVersion + 1);
    expect(decision.title.toString()).toBe('Решение editable');
    expect(decision.version).toBe(originalVersion);
    expect(context.repository.saveCount).toBe(1);
    expect((await context.repository.findById(decision.id))?.title.toString()).toBe(
      'Новое название',
    );
  });

  it('создаёт одно событие с временем Clock и id из IdGenerator', async () => {
    const decision = createPlannedDecision('event', DATE);
    decision.clearUncommittedEvents();
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Изменённое решение',
      expectedResult: 'Изменённый результат',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    const events = result.value.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'decision.details_updated',
      eventId: EntityId.create('details-event-1'),
    });
    expect(events[0]?.occurredAt).toEqual(NOW);
    expect(context.idGenerator.generatedCount).toBe(1);
  });

  it('preserves reschedule history when editing a decision', async () => {
    const decision = createPlannedDecision('history-edit', DATE);
    decision.reschedule(
      DayDate.create('2026-08-03'),
      'Changed priorities',
      new Date('2026-08-02T10:00:00.000+09:00'),
      EntityId.create('history-edit-rescheduled'),
    );
    decision.clearUncommittedEvents();
    const history = decision.rescheduleHistory;
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Updated after reschedule',
      expectedResult: decision.expectedResult?.toString() ?? '',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.rescheduleCount).toBe(1);
    expect(result.value.rescheduleHistory).toEqual(history);
  });

  it('разрешает очистить ожидаемый результат дополнительного решения', async () => {
    const decision = createPlannedDecision('additional', DATE, DECISION_KIND.additional);
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Дополнительное решение',
      expectedResult: '   ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.expectedResult).toBeNull();
  });

  it('назначает цель и наследует его сферу при редактировании', async () => {
    const decision = createPlannedDecision('project-edit', DATE, DECISION_KIND.additional);
    const project = Project.create({
      id: EntityId.create('project-edit-target'),
      sphereId: EntityId.create('sphere-project'),
      title: 'Цель редактирования',
      now: NOW,
    });
    const context = createContext([decision], [project]);

    const result = await context.command.execute({
      decisionId: decision.id,
      title: decision.title.toString(),
      expectedResult: '',
      projectId: project.id,
      sphereId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.projectId?.equals(project.id)).toBe(true);
    expect(result.value.sphereId?.toString()).toBe('sphere-project');
  });

  it('одинаковые нормализованные данные идемпотентны и не используют сохранение', async () => {
    const decision = createPlannedDecision('same', DATE);
    const context = createContext([decision]);
    decision.clearUncommittedEvents();
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: version,
      title: `  ${decision.title.toString()}  `,
      expectedResult: `  ${decision.expectedResult!.toString()}  `,
    });

    expect(result.ok).toBe(true);
    expect(decision.version).toBe(version);
    expect(decision.getUncommittedEvents()).toHaveLength(0);
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('возвращает decision.not_found', async () => {
    const context = createContext([]);
    const result = await context.command.execute({
      decisionId: EntityId.create('missing'),
      title: 'Название',
      expectedResult: 'Результат',
    });

    expectFailure(result, 'decision.not_found');
  });

  it.each([
    ['draft', createDecisionDraft('draft')],
    ['confirmed', confirmDecision(createPlannedDecision('confirmed', DATE))],
    ['cancelled', cancelDecision(createPlannedDecision('cancelled', DATE))],
    ['archived', archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)))],
  ])('запрещает редактирование %s Decision', async (_label, decision) => {
    const context = createContext([decision]);
    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });

    expectFailure(result, 'decision.cannot_edit');
    expect(context.repository.saveCount).toBe(0);
  });

  it('после начала разрешает уточнить причину, результат, цену и жертвы', async () => {
    const decision = markDecisionInProgress(createPlannedDecision('progress', DATE));
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
      title: decision.title.toString(),
      expectedResult: 'Уточнённый ожидаемый результат',
      reason: 'Уточнённая причина',
      price: 'Ещё 30 минут',
      sacrifices: 'Отложить второстепенное',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.status).toBe(DECISION_STATUS.inProgress);
    expect(result.value.reason).toBe('Уточнённая причина');
    expect(result.value.expectedResult?.toString()).toBe('Уточнённый ожидаемый результат');
    expect(result.value.price).toBe('Ещё 30 минут');
    expect(result.value.sacrifices).toBe('Отложить второстепенное');
    expect(context.repository.saveCount).toBe(1);
  });

  it('после начала блокирует изменение плановых полей', async () => {
    const decision = markDecisionInProgress(createPlannedDecision('locked', DATE));
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
      title: 'Другое название',
      expectedResult: decision.expectedResult!.toString(),
    });

    expectFailure(result, 'decision.started_fields_locked');
    expect(context.repository.saveCount).toBe(0);
  });

  it('преобразует дополнительное решение в главное и назначает свободный порядок', async () => {
    const editable = createPlannedDecision('convert', DATE, DECISION_KIND.additional);
    const first = createPlannedDecision('main-1', DATE, DECISION_KIND.main, 1);
    const third = createPlannedDecision('main-3', DATE, DECISION_KIND.main, 3);
    const context = createContext([editable, first, third]);

    const result = await context.command.execute({
      decisionId: editable.id,
      expectedVersion: editable.version,
      title: editable.title.toString(),
      expectedResult: 'Измеримый результат',
      kind: DECISION_KIND.main,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.kind).toBe(DECISION_KIND.main);
    expect(result.value.order).toBe(2);
  });

  it('запрещает преобразование в четвёртое главное решение', async () => {
    const editable = createPlannedDecision('fourth', DATE, DECISION_KIND.additional);
    const context = createContext([
      editable,
      createPlannedDecision('main-1', DATE, DECISION_KIND.main, 1),
      createPlannedDecision('main-2', DATE, DECISION_KIND.main, 2),
      createPlannedDecision('main-3', DATE, DECISION_KIND.main, 3),
    ]);

    const result = await context.command.execute({
      decisionId: editable.id,
      title: editable.title.toString(),
      expectedResult: 'Результат',
      kind: DECISION_KIND.main,
    });

    expectFailure(result, 'decision.main_limit_reached');
    expect(context.repository.saveCount).toBe(0);
  });

  it('не создаёт дубликат решения того же вида на ту же дату', async () => {
    const editable = createPlannedDecision('editable-duplicate', DATE, DECISION_KIND.main, 1);
    const existing = createPlannedDecision('existing-duplicate', DATE, DECISION_KIND.main, 2);
    const context = createContext([editable, existing]);

    const result = await context.command.execute({
      decisionId: editable.id,
      title: existing.title.toString(),
      expectedResult: 'Результат',
      kind: DECISION_KIND.main,
    });

    expectFailure(result, 'decision.duplicate_for_date');
    expect(context.repository.saveCount).toBe(0);
  });

  it('отклоняет устаревшую версию до изменения данных', async () => {
    const decision = createPlannedDecision('stale', DATE);
    const context = createContext([decision]);

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version - 1,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });

    expectFailure(result, 'decision.edit_conflict');
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('не перезаписывает данные при конфликте атомарного сохранения', async () => {
    const decision = createPlannedDecision('atomic-conflict', DATE);
    const context = createContext([decision]);
    context.repository.forceVersionConflict = true;

    const result = await context.command.execute({
      decisionId: decision.id,
      expectedVersion: decision.version,
      title: 'Конфликтующее название',
      expectedResult: 'Конфликтующий результат',
    });

    expectFailure(result, 'decision.edit_conflict');
    expect(context.repository.saveCount).toBe(0);
    const stored = await context.repository.findById(decision.id);
    expect(stored?.title.toString()).toBe('Решение atomic-conflict');
    expect(stored?.version).toBe(decision.version);
  });

  it('запрещает пустое название точным кодом и не сохраняет Decision', async () => {
    const decision = createPlannedDecision('empty-title', DATE);
    const context = createContext([decision]);
    const result = await context.command.execute({
      decisionId: decision.id,
      title: '   ',
      expectedResult: 'Результат',
    });

    expectFailure(result, 'decision.title_required');
    expect(context.repository.saveCount).toBe(0);
  });

  it('запрещает пустой результат главного решения точным кодом', async () => {
    const decision = createPlannedDecision('empty-result', DATE);
    const context = createContext([decision]);
    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Название',
      expectedResult: '   ',
    });

    expectFailure(result, 'decision.expected_result_required');
    expect(context.repository.saveCount).toBe(0);
  });

  it('не сохраняет Decision при ошибке value object', async () => {
    const decision = createPlannedDecision('invalid', DATE);
    const context = createContext([decision]);
    const version = decision.version;
    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'x'.repeat(201),
      expectedResult: 'Результат',
    });

    expect(result.ok).toBe(false);
    expect(decision.version).toBe(version);
    expect(context.repository.saveCount).toBe(0);
  });
});

function createContext(decisions: readonly Decision[], projects: readonly Project[] = []) {
  const repository = new TrackingDecisionRepository(decisions);
  const idGenerator = new FakeIdGenerator('details-event');
  const projectRepository = new InMemoryProjectRepository(projects);
  return {
    repository,
    idGenerator,
    command: new UpdateDecisionDetails(
      repository,
      new FakeClock(NOW),
      idGenerator,
      projectRepository,
    ),
  };
}

class TrackingDecisionRepository implements DecisionRepository {
  readonly #decisions = new Map<string, Decision>();
  public saveCount = 0;
  public forceVersionConflict = false;

  public constructor(decisions: readonly Decision[]) {
    for (const decision of decisions) {
      this.#decisions.set(decision.id.toString(), decision);
    }
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decisions.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return [...this.#decisions.values()].filter((decision) => decision.isScheduledFor(date));
  }

  public async save(decision: Decision): Promise<void> {
    this.#decisions.set(decision.id.toString(), decision);
    this.saveCount += 1;
  }

  public async saveIfVersionMatches(decision: Decision, expectedVersion: number): Promise<boolean> {
    const current = this.#decisions.get(decision.id.toString());
    if (this.forceVersionConflict || current === undefined || current.version !== expectedVersion) {
      return false;
    }

    this.#decisions.set(decision.id.toString(), decision);
    this.saveCount += 1;
    return true;
  }
}

function expectFailure(
  result: Awaited<ReturnType<UpdateDecisionDetails['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
