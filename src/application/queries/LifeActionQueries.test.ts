import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, type LifeAction } from '../../domain';
import { InMemoryLifeActionRepository } from '../../infrastructure';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { GetLifeActionsForDate } from './GetLifeActionsForDate';
import { GetLifeActionsForDecision } from './GetLifeActionsForDecision';

const DATE = DayDate.create('2026-08-01');
const ANOTHER_DATE = DayDate.create('2026-08-02');
const DECISION_ID = EntityId.create('decision-1');

describe('GetLifeActionsForDate', () => {
  it('возвращает только выбранную дату в порядке статуса и createdAt', async () => {
    const repository = new InMemoryLifeActionRepository();
    const readyNewer = createReadyLifeAction('ready-newer', DATE, {
      createdAt: at('09:00:00'),
    });
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled', DATE, { createdAt: at('06:00:00') }),
    );
    const readyOlder = createReadyLifeAction('ready-older', DATE, {
      createdAt: at('07:00:00'),
    });
    const completed = completeLifeAction(
      createReadyLifeAction('completed', DATE, { createdAt: at('05:00:00') }),
    );
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('in-progress', DATE, { createdAt: at('10:00:00') }),
    );
    const anotherDate = createReadyLifeAction('another-date', ANOTHER_DATE);
    const draft = createLifeActionDraft('draft');
    const sourceOrder = [
      readyNewer,
      cancelled,
      readyOlder,
      completed,
      inProgress,
      anotherDate,
      draft,
    ];
    await Promise.all(sourceOrder.map((lifeAction) => repository.save(lifeAction)));

    const result = await new GetLifeActionsForDate(repository).execute(DATE);

    expect(result).toEqual([inProgress, readyOlder, readyNewer, completed, cancelled]);
    await expect(repository.findByDate(DATE)).resolves.toEqual([
      readyNewer,
      cancelled,
      readyOlder,
      completed,
      inProgress,
    ]);
  });

  it('сохраняет стабильный порядок при одинаковом статусе и createdAt', async () => {
    const repository = new InMemoryLifeActionRepository();
    const first = createReadyLifeAction('first', DATE, { createdAt: at('08:00:00') });
    const second = createReadyLifeAction('second', DATE, { createdAt: at('08:00:00') });
    await repository.save(first);
    await repository.save(second);

    await expect(new GetLifeActionsForDate(repository).execute(DATE)).resolves.toEqual([
      first,
      second,
    ]);
  });

  it('не скрывает архивированное действие и возвращает независимый массив', async () => {
    const repository = new InMemoryLifeActionRepository();
    const archived = archiveLifeAction(completeLifeAction(createReadyLifeAction('archived', DATE)));
    await repository.save(archived);
    const query = new GetLifeActionsForDate(repository);
    const firstResult = await query.execute(DATE);

    (firstResult as LifeAction[]).length = 0;

    await expect(query.execute(DATE)).resolves.toEqual([archived]);
  });
});

describe('GetLifeActionsForDecision', () => {
  it('возвращает связанные действия по createdAt, включая финальные и архивированные', async () => {
    const repository = new InMemoryLifeActionRepository();
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled', DATE, {
        decisionId: DECISION_ID,
        createdAt: at('09:00:00'),
      }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('completed', DATE, {
        decisionId: DECISION_ID,
        createdAt: at('08:00:00'),
      }),
    );
    const archived = archiveLifeAction(
      completeLifeAction(
        createReadyLifeAction('archived', DATE, {
          decisionId: DECISION_ID,
          createdAt: at('07:00:00'),
        }),
      ),
    );
    const anotherDecision = createLifeActionDraft('another-decision', {
      decisionId: EntityId.create('decision-2'),
    });
    const unlinked = createLifeActionDraft('unlinked');
    await Promise.all(
      [cancelled, completed, archived, anotherDecision, unlinked].map((lifeAction) =>
        repository.save(lifeAction),
      ),
    );

    const result = await new GetLifeActionsForDecision(repository).execute(DECISION_ID);

    expect(result).toEqual([archived, completed, cancelled]);
    await expect(repository.findByDecisionId(DECISION_ID)).resolves.toEqual([
      cancelled,
      completed,
      archived,
    ]);
  });

  it('возвращает независимый массив результатов', async () => {
    const repository = new InMemoryLifeActionRepository();
    const linked = createLifeActionDraft('linked', { decisionId: DECISION_ID });
    await repository.save(linked);
    const query = new GetLifeActionsForDecision(repository);
    const firstResult = await query.execute(DECISION_ID);

    (firstResult as LifeAction[]).length = 0;

    await expect(query.execute(DECISION_ID)).resolves.toEqual([linked]);
  });
});

function at(time: string): Date {
  return new Date(`2026-08-01T${time}.000+09:00`);
}
