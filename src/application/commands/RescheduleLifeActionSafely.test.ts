import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  DayDate,
  EntityId,
  LifeActionRescheduled,
  SESSION_COMPLETION_KIND,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { RescheduleLifeActionSafely } from './RescheduleLifeActionSafely';

const CURRENT_DATE = DayDate.create('2026-08-03');
const PREVIOUS_DATE = DayDate.create('2026-08-04');
const NEW_DATE = DayDate.create('2026-08-10');
const NOW = new Date('2026-08-03T13:00:00.000+09:00');

describe('RescheduleLifeActionSafely', () => {
  it('переносит ready-действие в том же объекте, сохраняет его один раз и создаёт событие', async () => {
    const action = createReadyLifeAction('safe-reschedule', PREVIOUS_DATE, {
      decisionId: EntityId.create('preserved-decision'),
      description: 'Сохранённое описание',
    });
    const original = {
      decisionId: action.decisionId,
      title: action.title,
      description: action.description,
      expectedResult: action.expectedResult,
      status: action.status,
      createdAt: action.createdAt,
      actualResult: action.actualResult,
      version: action.version,
    };
    action.clearUncommittedEvents();
    const context = createContext(action, []);
    const now = vi.spyOn(context.clock, 'now');
    const currentDate = vi.spyOn(context.currentDateProvider, 'getCurrentDate');

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Ожидался успешный перенос.');
    }
    expect(result.value).toBe(action);
    expect(action.plannedDate?.equals(NEW_DATE)).toBe(true);
    expect(action.decisionId).toBe(original.decisionId);
    expect(action.title).toBe(original.title);
    expect(action.description).toBe(original.description);
    expect(action.expectedResult).toBe(original.expectedResult);
    expect(action.status).toBe(original.status);
    expect(action.createdAt).toEqual(original.createdAt);
    expect(action.actualResult).toBe(original.actualResult);
    expect(action.version).toBe(original.version + 1);
    expect(context.lifeActionRepository.saveCount).toBe(1);
    expect(context.actionSessionRepository.saveCount).toBe(0);
    expect(now).toHaveBeenCalledOnce();
    expect(currentDate).toHaveBeenCalledOnce();
    expect(context.idGenerator.generatedCount).toBe(1);
    const event = action.getUncommittedEvents()[0];
    expect(event).toBeInstanceOf(LifeActionRescheduled);
    expect(event).toMatchObject({
      eventType: 'action.rescheduled',
      eventId: EntityId.create('safe-reschedule-event-1'),
      lifeActionId: action.id,
      previousPlannedDate: PREVIOUS_DATE,
      newPlannedDate: NEW_DATE,
    });
    expect(event?.occurredAt).toEqual(NOW);
  });

  it('перенос на ту же дату идемпотентен без времени, id, события и сохранения', async () => {
    const action = createReadyLifeAction('same-date', PREVIOUS_DATE);
    action.clearUncommittedEvents();
    const version = action.version;
    const context = createContext(action, []);
    const now = vi.spyOn(context.clock, 'now');

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: PREVIOUS_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(action.version).toBe(version);
    expect(action.getUncommittedEvents()).toHaveLength(0);
    expect(context.lifeActionRepository.saveCount).toBe(0);
    expect(context.actionSessionRepository.findByLifeActionIdCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
    expect(now).not.toHaveBeenCalled();
  });

  it('возвращает action.not_found без использования остальных зависимостей', async () => {
    const context = createContext(null, []);

    const result = await context.command.execute({
      lifeActionId: EntityId.create('missing'),
      newPlannedDate: NEW_DATE.toString(),
    });

    expectFailure(result, 'action.not_found');
    expect(context.currentDateProvider.getCurrentDateCount).toBe(0);
    expect(context.actionSessionRepository.findByLifeActionIdCount).toBe(0);
    expectNoWrites(context);
  });

  it.each([
    ['draft', createLifeActionDraft('draft-reschedule')],
    [
      'in_progress',
      markLifeActionInProgress(createReadyLifeAction('progress-reschedule', PREVIOUS_DATE)),
    ],
    ['completed', completeLifeAction(createReadyLifeAction('completed-reschedule', PREVIOUS_DATE))],
    ['cancelled', cancelLifeAction(createReadyLifeAction('cancelled-reschedule', PREVIOUS_DATE))],
    [
      'archived',
      archiveLifeAction(
        completeLifeAction(createReadyLifeAction('archived-reschedule', PREVIOUS_DATE)),
      ),
    ],
  ])('запрещает перенос состояния %s без мутаций', async (_label, action) => {
    action.clearUncommittedEvents();
    const version = action.version;
    const plannedDate = action.plannedDate;
    const context = createContext(action, []);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expectFailure(result, 'action.cannot_reschedule');
    expect(action.plannedDate).toBe(plannedDate);
    expect(action.version).toBe(version);
    expect(action.getUncommittedEvents()).toHaveLength(0);
    expectNoWrites(context);
  });

  it('требует новую дату', async () => {
    const action = createReadyLifeAction('required-date', PREVIOUS_DATE);
    const context = createContext(action, []);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: '   ',
    });

    expectFailure(result, 'action.planned_date_required');
    expectNoWrites(context);
  });

  it('запрещает дату раньше управляемой текущей календарной даты', async () => {
    const action = createReadyLifeAction('past-date', PREVIOUS_DATE);
    const context = createContext(action, []);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: '2026-08-02',
    });

    expectFailure(result, 'action.planned_date_in_past');
    expect(context.currentDateProvider.getCurrentDateCount).toBe(1);
    expectNoWrites(context);
  });

  it.each([
    ['running', (action: LifeAction) => runningSession('running', action)],
    ['paused', (action: LifeAction) => pausedSession('paused', action)],
  ])('%s-сессия выбранного действия блокирует перенос', async (_label, createSession) => {
    const action = createReadyLifeAction(`blocked-${_label}`, PREVIOUS_DATE);
    const session = createSession(action);
    const sessionVersion = session.version;
    const context = createContext(action, [session]);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expectFailure(result, 'action.session_unfinished');
    expect(session.version).toBe(sessionVersion);
    expect(context.actionSessionRepository.saveCount).toBe(0);
    expectNoWrites(context);
  });

  it('completed-сессии выбранного действия не блокируют перенос и не меняются', async () => {
    const action = createReadyLifeAction('completed-session-action', PREVIOUS_DATE);
    const session = completedSession('completed-session', action);
    const version = session.version;
    const startedAt = session.startedAt;
    const context = createContext(action, [session]);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(session.version).toBe(version);
    expect(session.startedAt).toEqual(startedAt);
    expect(context.actionSessionRepository.saveCount).toBe(0);
  });

  it('незавершённая сессия другого действия не блокирует перенос', async () => {
    const action = createReadyLifeAction('target-action', PREVIOUS_DATE);
    const foreignAction = createReadyLifeAction('foreign-action', PREVIOUS_DATE);
    const context = createContext(action, [runningSession('foreign-running', foreignAction)]);

    const result = await context.command.execute({
      lifeActionId: action.id,
      newPlannedDate: NEW_DATE.toString(),
    });

    expect(result.ok).toBe(true);
    expect(context.lifeActionRepository.saveCount).toBe(1);
    expect(context.actionSessionRepository.saveCount).toBe(0);
  });
});

function runningSession(id: string, action: LifeAction): ActionSession {
  return ActionSession.start({
    id: EntityId.create(`${id}-session`),
    lifeActionId: action.id,
    startedAt: new Date('2026-08-03T09:00:00.000+09:00'),
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function pausedSession(id: string, action: LifeAction): ActionSession {
  const session = runningSession(id, action);
  session.pause(new Date('2026-08-03T09:10:00.000+09:00'), EntityId.create(`${id}-paused-event`));
  expect(session.status).toBe(ACTION_SESSION_STATUS.paused);
  return session;
}

function completedSession(id: string, action: LifeAction): ActionSession {
  const session = runningSession(id, action);
  session.complete({
    completedAt: new Date('2026-08-03T09:30:00.000+09:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: EntityId.create(`${id}-completed-event`),
  });
  return session;
}

function createContext(action: LifeAction | null, sessions: readonly ActionSession[]) {
  const lifeActionRepository = new TrackingLifeActionRepository(action);
  const actionSessionRepository = new TrackingActionSessionRepository(sessions);
  const clock = new FakeClock(NOW);
  const idGenerator = new FakeIdGenerator('safe-reschedule-event');
  const currentDateProvider = new TrackingCurrentDateProvider(CURRENT_DATE);
  return {
    lifeActionRepository,
    actionSessionRepository,
    clock,
    idGenerator,
    currentDateProvider,
    command: new RescheduleLifeActionSafely(
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
      currentDateProvider,
    ),
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

class TrackingActionSessionRepository implements ActionSessionRepository {
  readonly #sessions: readonly ActionSession[];
  public findByLifeActionIdCount = 0;
  public saveCount = 0;

  public constructor(sessions: readonly ActionSession[]) {
    this.#sessions = sessions;
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessions.find((session) => session.id.equals(id)) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    this.findByLifeActionIdCount += 1;
    return this.#sessions.filter((session) => session.lifeActionId.equals(lifeActionId));
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#sessions.find((session) => !session.isCompleted()) ?? null;
  }

  public async save(): Promise<void> {
    this.saveCount += 1;
  }
}

class TrackingCurrentDateProvider extends FakeCurrentDateProvider {
  public getCurrentDateCount = 0;

  public override getCurrentDate(): DayDate {
    this.getCurrentDateCount += 1;
    return super.getCurrentDate();
  }
}

function expectNoWrites(context: ReturnType<typeof createContext>): void {
  expect(context.lifeActionRepository.saveCount).toBe(0);
  expect(context.actionSessionRepository.saveCount).toBe(0);
  expect(context.idGenerator.generatedCount).toBe(0);
}

function expectFailure(
  result: Awaited<ReturnType<RescheduleLifeActionSafely['execute']>>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe(code);
  }
}
