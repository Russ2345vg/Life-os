import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import {
  archiveDecision,
  confirmDecision,
  createDecisionDraft,
  createPlannedDecision,
  decisionId,
} from '../../test/helpers/DecisionTestFactory';
import { InMemoryDecisionRepository } from './InMemoryDecisionRepository';

const DATE = DayDate.create('2026-08-01');

describe('InMemoryDecisionRepository', () => {
  it('сохраняет решение и находит его по идентификатору', async () => {
    const repository = new InMemoryDecisionRepository();
    const decision = createDecisionDraft('decision-1');

    await repository.save(decision);

    await expect(repository.findById(decision.id)).resolves.toBe(decision);
    await expect(repository.findById(decisionId('missing'))).resolves.toBeNull();
  });

  it('повторным сохранением обновляет существующую запись', async () => {
    const repository = new InMemoryDecisionRepository();
    const decision = createDecisionDraft('decision-1');
    await repository.save(decision);
    decision.plan({
      plannedDate: DATE,
      kind: decision.kind,
      occurredAt: new Date('2026-08-01T10:00:00.000+09:00'),
      eventId: decisionId('planned-event'),
    });

    await repository.save(decision);

    await expect(repository.findByDate(DATE)).resolves.toEqual([decision]);
  });

  it('заменяет объект с тем же идентификатором без дубликата', async () => {
    const repository = new InMemoryDecisionRepository();
    const first = createDecisionDraft('same-id');
    const replacement = createPlannedDecision('same-id', DATE);

    await repository.save(first);
    await repository.save(replacement);

    await expect(repository.findById(first.id)).resolves.toBe(replacement);
    await expect(repository.findByDate(DATE)).resolves.toHaveLength(1);
  });

  it('находит по дате все решения', async () => {
    const repository = new InMemoryDecisionRepository();
    const first = createPlannedDecision('first', DATE);
    const second = createPlannedDecision('second', DATE);
    const anotherDate = createPlannedDecision('another-date', DayDate.create('2026-08-02'));

    await Promise.all([first, second, anotherDate].map((decision) => repository.save(decision)));

    await expect(repository.findByDate(DATE)).resolves.toEqual([first, second]);
  });

  it('сохраняет архивированное решение доступным по дате и id', async () => {
    const repository = new InMemoryDecisionRepository();
    const archived = archiveDecision(confirmDecision(createPlannedDecision('archived', DATE)));
    await repository.save(archived);

    await expect(repository.findByDate(DATE)).resolves.toEqual([archived]);
    await expect(repository.findById(archived.id)).resolves.toBe(archived);
  });

  it('возвращает независимый массив результатов', async () => {
    const repository = new InMemoryDecisionRepository();
    const decision = createPlannedDecision('decision-1', DATE);
    await repository.save(decision);
    const firstResult = await repository.findByDate(DATE);

    (firstResult as Decision[]).length = 0;

    await expect(repository.findByDate(DATE)).resolves.toEqual([decision]);
  });
});

type Decision = ReturnType<typeof createDecisionDraft>;
