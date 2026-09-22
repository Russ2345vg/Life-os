import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId } from '../../domain';
import { InMemoryDecisionRepository, InMemoryLifeActionRepository } from '../../infrastructure';
import {
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { GetRoutineActionDetails } from './GetRoutineActionDetails';
import { GetRoutineActionOptions } from './GetRoutineActionOptions';

const DATE = DayDate.create('2026-08-08');

describe('routine action queries', () => {
  it('offers only unfinished actions and includes their canonical decision', async () => {
    const actionRepository = new InMemoryLifeActionRepository();
    const decisionRepository = new InMemoryDecisionRepository();
    const decision = createPlannedDecision('routine-decision', DATE);
    const draft = createLifeActionDraft('routine-draft', { decisionId: decision.id });
    const ready = createReadyLifeAction('routine-ready', DATE, { decisionId: decision.id });
    const completed = completeLifeAction(
      createReadyLifeAction('routine-completed', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('routine-cancelled', DATE, { decisionId: decision.id }),
    );
    await decisionRepository.save(decision);
    await Promise.all(
      [draft, ready, completed, cancelled].map((action) => actionRepository.save(action)),
    );
    const findAllDecisions = vi.spyOn(decisionRepository, 'findAll');
    const findDecisionById = vi.spyOn(decisionRepository, 'findById');

    const options = await new GetRoutineActionOptions(
      actionRepository,
      decisionRepository,
    ).execute();

    expect(options.map((option) => option.lifeAction.id.toString()).sort()).toEqual([
      'routine-draft',
      'routine-ready',
    ]);
    expect(options.every((option) => option.decision?.id.equals(decision.id))).toBe(true);
    expect(findAllDecisions).toHaveBeenCalledTimes(1);
    expect(findDecisionById).not.toHaveBeenCalled();
  });

  it('offers one representative for a recurring action instead of every future occurrence', async () => {
    const actionRepository = new InMemoryLifeActionRepository();
    const decisionRepository = new InMemoryDecisionRepository();
    const source = createReadyLifeAction('recurring-source', DATE);
    source.setPlanningMetadata({
      occurrence: {
        ruleId: 'recurrence:training',
        slot: '2026-08-08',
        ruleRevision: 1,
        originalDate: '2026-08-08',
      },
    });
    const tomorrow = createReadyLifeAction('recurring-tomorrow', DayDate.create('2026-08-09'));
    tomorrow.setPlanningMetadata({
      occurrence: {
        ruleId: 'recurrence:training',
        slot: '2026-08-09',
        ruleRevision: 1,
        originalDate: '2026-08-09',
      },
    });
    const later = createReadyLifeAction('recurring-later', DayDate.create('2026-08-10'));
    later.setPlanningMetadata({
      occurrence: {
        ruleId: 'recurrence:training',
        slot: '2026-08-10',
        ruleRevision: 1,
        originalDate: '2026-08-10',
      },
    });
    const ordinary = createReadyLifeAction('ordinary', DATE);
    await Promise.all(
      [source, tomorrow, later, ordinary].map((action) => actionRepository.save(action)),
    );

    const options = await new GetRoutineActionOptions(
      actionRepository,
      decisionRepository,
    ).execute();

    expect(options.map((option) => option.lifeAction.id.toString()).sort()).toEqual([
      'ordinary',
      'recurring-source',
    ]);
    expect(
      options.find((option) => option.lifeAction.id.toString() === 'recurring-source')?.lifeAction
        .occurrence,
    ).toMatchObject({ ruleId: 'recurrence:training' });
  });

  it('keeps the next available occurrence when the original occurrence is completed', async () => {
    const actionRepository = new InMemoryLifeActionRepository();
    const decisionRepository = new InMemoryDecisionRepository();
    const completed = completeLifeAction(createReadyLifeAction('completed-occurrence', DATE));
    completed.setPlanningMetadata({
      occurrence: {
        ruleId: 'recurrence:reading',
        slot: DATE.toString(),
        ruleRevision: 1,
        originalDate: DATE.toString(),
      },
    });
    const next = createReadyLifeAction('next-occurrence', DayDate.create('2026-08-09'));
    next.setPlanningMetadata({
      occurrence: {
        ruleId: 'recurrence:reading',
        slot: '2026-08-09',
        ruleRevision: 1,
        originalDate: '2026-08-09',
      },
    });
    await Promise.all([completed, next].map((action) => actionRepository.save(action)));

    const options = await new GetRoutineActionOptions(
      actionRepository,
      decisionRepository,
    ).execute();

    expect(options.map((option) => option.lifeAction.id.toString())).toEqual(['next-occurrence']);
  });

  it('resolves a completed action for a safe historical card and returns null when deleted', async () => {
    const actionRepository = new InMemoryLifeActionRepository();
    const decisionRepository = new InMemoryDecisionRepository();
    const completed = completeLifeAction(createReadyLifeAction('historical-action', DATE));
    await actionRepository.save(completed);
    const query = new GetRoutineActionDetails(actionRepository, decisionRepository);

    expect((await query.execute(completed.id))?.lifeAction).toBe(completed);
    await expect(query.execute(EntityId.create('missing-action'))).resolves.toBeNull();
  });

  it('reads changed action state from the action repository instead of a routine snapshot', async () => {
    const actionRepository = new InMemoryLifeActionRepository();
    const decisionRepository = new InMemoryDecisionRepository();
    const action = createReadyLifeAction('changing-action', DATE);
    await actionRepository.save(action);
    const query = new GetRoutineActionDetails(actionRepository, decisionRepository);
    expect((await query.execute(action.id))?.lifeAction.status).toBe('ready');

    completeLifeAction(action);
    await actionRepository.save(action);

    expect((await query.execute(action.id))?.lifeAction.status).toBe('completed');
  });
});
