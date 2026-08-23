import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, type LifeAction } from '../../domain';
import {
  archiveLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  lifeActionId,
} from '../../test/helpers/LifeActionTestFactory';
import { InMemoryLifeActionRepository } from './InMemoryLifeActionRepository';

const DATE = DayDate.create('2026-08-01');
const ANOTHER_DATE = DayDate.create('2026-08-02');
const DECISION_ID = EntityId.create('decision-1');

describe('InMemoryLifeActionRepository', () => {
  it('сохраняет действие и находит его по идентификатору', async () => {
    const repository = new InMemoryLifeActionRepository();
    const lifeAction = createLifeActionDraft('action-1');

    await repository.save(lifeAction);

    await expect(repository.findById(lifeAction.id)).resolves.toBe(lifeAction);
    await expect(repository.findById(lifeActionId('missing'))).resolves.toBeNull();
  });

  it('повторным сохранением обновляет существующую запись без дубликата', async () => {
    const repository = new InMemoryLifeActionRepository();
    const draft = createLifeActionDraft('same-id');
    const replacement = createReadyLifeAction('same-id', DATE);

    await repository.save(draft);
    await repository.save(replacement);

    await expect(repository.findById(draft.id)).resolves.toBe(replacement);
    await expect(repository.findByDate(DATE)).resolves.toEqual([replacement]);
  });

  it('находит действия по plannedDate и исключает другую дату и черновик без даты', async () => {
    const repository = new InMemoryLifeActionRepository();
    const first = createReadyLifeAction('first', DATE);
    const second = createReadyLifeAction('second', DATE);
    const anotherDate = createReadyLifeAction('another-date', ANOTHER_DATE);
    const draft = createLifeActionDraft('draft');

    await Promise.all(
      [first, second, anotherDate, draft].map((lifeAction) => repository.save(lifeAction)),
    );

    await expect(repository.findByDate(DATE)).resolves.toEqual([first, second]);
  });

  it('находит связанные с Decision действия и исключает несвязанные', async () => {
    const repository = new InMemoryLifeActionRepository();
    const linked = createLifeActionDraft('linked', { decisionId: DECISION_ID });
    const anotherDecision = createLifeActionDraft('another-decision', {
      decisionId: EntityId.create('decision-2'),
    });
    const unlinked = createLifeActionDraft('unlinked');

    await Promise.all(
      [linked, anotherDecision, unlinked].map((lifeAction) => repository.save(lifeAction)),
    );

    await expect(repository.findByDecisionId(DECISION_ID)).resolves.toEqual([linked]);
  });

  it('пакетно находит действия нескольких Decision и исключает самостоятельные', async () => {
    const repository = new InMemoryLifeActionRepository();
    const secondDecisionId = EntityId.create('decision-2');
    const first = createLifeActionDraft('first-linked', { decisionId: DECISION_ID });
    const second = createLifeActionDraft('second-linked', { decisionId: secondDecisionId });
    const unrelated = createLifeActionDraft('unrelated', {
      decisionId: EntityId.create('decision-3'),
    });
    const standalone = createLifeActionDraft('standalone');
    await Promise.all(
      [first, second, unrelated, standalone].map((lifeAction) => repository.save(lifeAction)),
    );

    await expect(repository.findByDecisionIds([DECISION_ID, secondDecisionId])).resolves.toEqual([
      first,
      second,
    ]);
  });

  it('возвращает независимые массивы результатов обоих списочных поисков', async () => {
    const repository = new InMemoryLifeActionRepository();
    const lifeAction = createReadyLifeAction('linked', DATE, { decisionId: DECISION_ID });
    await repository.save(lifeAction);
    const byDate = await repository.findByDate(DATE);
    const byDecision = await repository.findByDecisionId(DECISION_ID);

    (byDate as LifeAction[]).length = 0;
    (byDecision as LifeAction[]).length = 0;

    await expect(repository.findByDate(DATE)).resolves.toEqual([lifeAction]);
    await expect(repository.findByDecisionId(DECISION_ID)).resolves.toEqual([lifeAction]);
  });

  it('сохраняет завершённое и архивированное действие доступным по всем ключам', async () => {
    const repository = new InMemoryLifeActionRepository();
    const archived = archiveLifeAction(
      completeLifeAction(createReadyLifeAction('archived', DATE, { decisionId: DECISION_ID })),
    );
    await repository.save(archived);

    await expect(repository.findById(archived.id)).resolves.toBe(archived);
    await expect(repository.findByDate(DATE)).resolves.toEqual([archived]);
    await expect(repository.findByDecisionId(DECISION_ID)).resolves.toEqual([archived]);
  });
});
