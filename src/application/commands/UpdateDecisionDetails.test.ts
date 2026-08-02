import { describe, expect, it } from 'vitest';
import { DayDate, DECISION_KIND, DECISION_STATUS, EntityId, type Decision } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
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
import { UpdateDecisionDetails } from './UpdateDecisionDetails';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T12:00:00.000+09:00');

describe('UpdateDecisionDetails', () => {
  it('редактирует planned Decision и сохраняет только изменяемые сведения', async () => {
    const decision = createPlannedDecision('editable', DATE, DECISION_KIND.main, 2);
    const context = createContext(decision);
    const before = snapshotStableFields(decision);
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
      title: '  Новое название  ',
      expectedResult: '  Новый ожидаемый результат  ',
    });

    expect(result.ok).toBe(true);
    expect(decision.title.toString()).toBe('Новое название');
    expect(decision.expectedResult?.toString()).toBe('Новый ожидаемый результат');
    expect(snapshotStableFields(decision)).toEqual(before);
    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.version).toBe(version + 1);
    expect(context.repository.saveCount).toBe(1);
  });

  it('создаёт одно событие с временем Clock и id из IdGenerator', async () => {
    const decision = createPlannedDecision('event', DATE);
    decision.clearUncommittedEvents();
    const context = createContext(decision);

    await context.command.execute({
      decisionId: decision.id,
      title: 'Изменённое решение',
      expectedResult: 'Изменённый результат',
    });

    const events = decision.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'decision.details_updated',
      eventId: EntityId.create('details-event-1'),
    });
    expect(events[0]?.occurredAt).toEqual(NOW);
    expect(context.idGenerator.generatedCount).toBe(1);
  });

  it('разрешает очистить ожидаемый результат дополнительного решения', async () => {
    const decision = createPlannedDecision('additional', DATE, DECISION_KIND.additional);
    const context = createContext(decision);

    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Дополнительное решение',
      expectedResult: '   ',
    });

    expect(result.ok).toBe(true);
    expect(decision.expectedResult).toBeNull();
  });

  it('одинаковые нормализованные данные идемпотентны и не используют сохранение', async () => {
    const decision = createPlannedDecision('same', DATE);
    const context = createContext(decision);
    decision.clearUncommittedEvents();
    const version = decision.version;

    const result = await context.command.execute({
      decisionId: decision.id,
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
    const context = createContext(null);
    const result = await context.command.execute({
      decisionId: EntityId.create('missing'),
      title: 'Название',
      expectedResult: 'Результат',
    });

    expectFailure(result, 'decision.not_found');
  });

  it.each([
    ['draft', createDecisionDraft('draft')],
    ['in_progress', markDecisionInProgress(createPlannedDecision('progress', DATE))],
    ['confirmed', confirmDecision(createPlannedDecision('confirmed', DATE))],
    ['cancelled', cancelDecision(createPlannedDecision('cancelled', DATE))],
    ['archived', archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)))],
  ])('запрещает редактирование %s Decision', async (_label, decision) => {
    const context = createContext(decision);
    const result = await context.command.execute({
      decisionId: decision.id,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });

    expectFailure(result, 'decision.cannot_edit');
    expect(context.repository.saveCount).toBe(0);
  });

  it('запрещает пустое название точным кодом и не сохраняет Decision', async () => {
    const decision = createPlannedDecision('empty-title', DATE);
    const context = createContext(decision);
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
    const context = createContext(decision);
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
    const context = createContext(decision);
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

function snapshotStableFields(decision: Decision) {
  return {
    kind: decision.kind,
    order: decision.order,
    plannedDate: decision.plannedDate?.toString() ?? null,
    status: decision.status,
  } as const;
}

function createContext(decision: Decision | null) {
  const repository = new TrackingDecisionRepository(decision);
  const idGenerator = new FakeIdGenerator('details-event');
  return {
    repository,
    idGenerator,
    command: new UpdateDecisionDetails(repository, new FakeClock(NOW), idGenerator),
  };
}

class TrackingDecisionRepository implements DecisionRepository {
  readonly #decision: Decision | null;
  public saveCount = 0;

  public constructor(decision: Decision | null) {
    this.#decision = decision;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decision?.id.equals(id) ? this.#decision : null;
  }

  public async findByDate(): Promise<readonly Decision[]> {
    return this.#decision === null ? [] : [this.#decision];
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
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
