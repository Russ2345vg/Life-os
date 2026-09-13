import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DECISION_KIND,
  DayDate,
  Direction,
  EntityId,
  Project,
  type Decision,
  type LifeAction,
} from '../../domain';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { confirmDecision, createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { GetManagementOverview, MANAGEMENT_SIGNAL_KIND } from './GetManagementOverview';

const TODAY = DayDate.create('2026-08-11');
const TOMORROW = DayDate.create('2026-08-12');
const NOW = new Date('2026-08-11T08:00:00.000+09:00');

describe('GetManagementOverview', () => {
  it('собирает фокус, сегодняшний срез, курс и только заданные сигналы', async () => {
    const direction = Direction.create({
      id: id('direction-main'),
      name: 'Развитие LifeOS',
      isMain: true,
      now: NOW,
    });
    const archivedDirection = Direction.create({
      id: id('direction-archive'),
      name: 'Архив',
      now: NOW,
    }).archive(NOW);
    const mainProject = project('project-main', 'Главная цель', true, direction.id);
    const emptyProject = project('project-empty', 'Цель без решений');
    const decisionProject = project('project-decision', 'Цель без действий');
    const coveredProject = project('project-covered', 'Цель с действием');

    const mainDecision = confirmDecision(
      createPlannedDecision('main-today', TODAY, DECISION_KIND.main, 1, mainProject.id),
    );
    const decisionWithoutActions = createPlannedDecision(
      'without-actions',
      TODAY,
      DECISION_KIND.main,
      2,
      decisionProject.id,
    );
    const coveredDecision = createPlannedDecision(
      'covered',
      TOMORROW,
      DECISION_KIND.main,
      1,
      coveredProject.id,
    );
    const coveredAction = createReadyLifeAction('covered', TOMORROW, {
      decisionId: coveredDecision.id,
    });
    const sessionAction = createReadyLifeAction('session', TODAY);
    const completedTodayAction = completeLifeAction(createReadyLifeAction('completed', TODAY));
    const session = ActionSession.start({
      id: id('session-current'),
      lifeActionId: sessionAction.id,
      startedAt: NOW,
      eventId: id('session-current-event'),
    });
    const directions = collection([direction, archivedDirection]);
    const projects = collection([mainProject, emptyProject, decisionProject, coveredProject]);
    const decisions = collection<Decision>([mainDecision, decisionWithoutActions, coveredDecision]);
    const lifeActions = collection<LifeAction>([
      coveredAction,
      sessionAction,
      completedTodayAction,
    ]);
    const sessions = { findUnfinished: vi.fn().mockResolvedValue(session) };

    const snapshot = await new GetManagementOverview(
      directions,
      projects,
      decisions,
      lifeActions,
      sessions,
    ).execute(TODAY);

    expect(snapshot.focus).toEqual({
      kind: 'project',
      id: 'project-main',
      title: 'Главная цель',
      desiredResult: null,
      directionName: 'Развитие LifeOS',
    });
    expect(snapshot.today).toEqual({
      mainDecision: { id: 'main-today', title: 'Решение main-today' },
      decisionCount: 2,
      actionCount: 2,
      currentSession: {
        actionId: 'session',
        actionTitle: 'Действие session',
        status: 'running',
      },
    });
    expect(snapshot.course).toEqual({ activeDirectionCount: 1, activeProjectCount: 4 });
    expect(snapshot.signals.map((signal) => signal.kind)).toEqual([
      MANAGEMENT_SIGNAL_KIND.mainProjectWithoutActiveDecisions,
      MANAGEMENT_SIGNAL_KIND.activeProjectWithoutDecisions,
      MANAGEMENT_SIGNAL_KIND.decisionWithoutUnfinishedActions,
    ]);
    expect(snapshot.signals.map((signal) => signal.detail)).toEqual([
      'Главная цель',
      'Цель без решений',
      'Решение without-actions',
    ]);
  });

  it('делает по одному bulk-чтению каждого источника без запросов в цикле', async () => {
    const directions = collection([]);
    const projects = collection([]);
    const decisions = collection<Decision>([]);
    const lifeActions = collection<LifeAction>([]);
    const sessions = { findUnfinished: vi.fn().mockResolvedValue(null) };

    const snapshot = await new GetManagementOverview(
      directions,
      projects,
      decisions,
      lifeActions,
      sessions,
    ).execute(TODAY);

    expect(directions.findAll).toHaveBeenCalledTimes(1);
    expect(projects.findAll).toHaveBeenCalledTimes(1);
    expect(decisions.findAll).toHaveBeenCalledTimes(1);
    expect(lifeActions.findAll).toHaveBeenCalledTimes(1);
    expect(sessions.findUnfinished).toHaveBeenCalledTimes(1);
    expect(snapshot.focus).toEqual({ kind: 'empty' });
    expect(snapshot.signals).toEqual([
      {
        kind: MANAGEMENT_SIGNAL_KIND.focusUndefined,
        directionId: null,
        projectId: null,
        decisionId: null,
        title: 'Фокус не определён',
        detail: 'Нет главной цели или главного направления.',
      },
    ]);
  });

  it('использует главное направление как fallback, когда главной цели нет', async () => {
    const mainDirection = Direction.create({
      id: id('direction-fallback'),
      name: 'Главное направление',
      isMain: true,
      now: NOW,
    });

    const snapshot = await new GetManagementOverview(
      collection([mainDirection]),
      collection([]),
      collection<Decision>([]),
      collection<LifeAction>([]),
      { findUnfinished: vi.fn().mockResolvedValue(null) },
    ).execute(TODAY);

    expect(snapshot.focus).toEqual({
      kind: 'direction',
      id: 'direction-fallback',
      title: 'Главное направление',
    });
    expect(snapshot.signals).not.toContainEqual(
      expect.objectContaining({ kind: MANAGEMENT_SIGNAL_KIND.focusUndefined }),
    );
    expect(snapshot.signals).toContainEqual({
      kind: MANAGEMENT_SIGNAL_KIND.mainDirectionWithoutActiveProjects,
      directionId: 'direction-fallback',
      projectId: null,
      decisionId: null,
      title: 'Главное направление без активных целей',
      detail: 'Главное направление',
    });
  });

  it('сигнализирует о любом активном решении без незавершённых действий и не дублирует цель', async () => {
    const decision = createPlannedDecision('standalone', TODAY);

    const snapshot = await new GetManagementOverview(
      collection([]),
      collection([]),
      collection<Decision>([decision, decision]),
      collection<LifeAction>([]),
      { findUnfinished: vi.fn().mockResolvedValue(null) },
    ).execute(TODAY);

    expect(
      snapshot.signals.filter(
        (signal) => signal.kind === MANAGEMENT_SIGNAL_KIND.decisionWithoutUnfinishedActions,
      ),
    ).toEqual([
      {
        kind: MANAGEMENT_SIGNAL_KIND.decisionWithoutUnfinishedActions,
        directionId: null,
        projectId: null,
        decisionId: 'standalone',
        title: 'Решение без незавершённых действий',
        detail: 'Решение standalone',
      },
    ]);
  });

  it('не создаёт сигналов, когда все связи покрыты', async () => {
    const direction = Direction.create({
      id: id('direction-covered'),
      name: 'Направление с целью',
      isMain: true,
      now: NOW,
    });
    const mainProject = project('project-covered-main', 'Главная цель', true, direction.id);
    const decision = createPlannedDecision(
      'covered-main',
      TODAY,
      DECISION_KIND.main,
      1,
      mainProject.id,
    );
    const action = createReadyLifeAction('covered-main-action', TODAY, {
      decisionId: decision.id,
    });

    const snapshot = await new GetManagementOverview(
      collection([direction]),
      collection([mainProject]),
      collection<Decision>([decision]),
      collection<LifeAction>([action]),
      { findUnfinished: vi.fn().mockResolvedValue(null) },
    ).execute(TODAY);

    expect(snapshot.signals).toEqual([]);
  });
});

function collection<T>(items: readonly T[]) {
  return { findAll: vi.fn().mockResolvedValue(items) };
}

function project(
  projectId: string,
  title: string,
  isMain = false,
  directionId = id('direction-unassigned'),
): Project {
  return Project.create({ id: id(projectId), title, isMain, directionId, now: NOW });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
