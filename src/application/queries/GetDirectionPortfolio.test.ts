import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  DayDate,
  Direction,
  EntityId,
  Project,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import type { ActionSessionsByLifeActionIdsReader } from '../ports/ActionSessionsByLifeActionIdsReader';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionsByProjectIdsReader } from '../ports/DecisionsByProjectIdsReader';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { LifeActionsByDecisionIdsReader } from '../ports/LifeActionsByDecisionIdsReader';
import type { ProjectRepository } from '../ports/ProjectRepository';
import { DIRECTION_OPERATIONAL_STATE, GetDirectionPortfolio } from './GetDirectionPortfolio';

const NOW = new Date('2026-08-10T08:00:00.000Z');
const DIRECTION_ID = EntityId.create('direction-portfolio');

function project(id: string, status: 'active' | 'paused' | 'completed', isMain = false): Project {
  let value = Project.create({
    id: EntityId.create(id),
    directionId: DIRECTION_ID,
    title: id,
    isMain,
    now: NOW,
  });
  if (status === 'paused') value = value.pause(new Date(NOW.getTime() + 1));
  if (status === 'completed') value = value.complete(new Date(NOW.getTime() + 1));
  return value;
}

function setup(
  projects: readonly Project[],
  withWorkingDecision = false,
  withExecutionFacts = false,
) {
  const direction = Direction.create({ id: DIRECTION_ID, name: 'LifeOS', now: NOW });
  const decisions = withWorkingDecision
    ? [
        createPlannedDecision(
          'moving-decision',
          DayDate.create('2026-08-10'),
          undefined,
          1,
          projects[0]?.id,
        ),
      ]
    : [];
  const directionRepository = {
    findById: vi.fn().mockResolvedValue(direction),
  } as unknown as DirectionRepository;
  const projectRepository = {
    findByDirectionId: vi.fn().mockResolvedValue(projects),
  } as unknown as ProjectRepository;
  const decisionReader: DecisionsByProjectIdsReader = {
    findByProjectIds: vi.fn().mockResolvedValue(decisions),
  };
  const lifeActionReader: LifeActionsByDecisionIdsReader = {
    findByDecisionIds: vi.fn().mockResolvedValue(
      withExecutionFacts && decisions[0] !== undefined
        ? [
            createReadyLifeAction('unfinished', DayDate.create('2026-08-05'), {
              decisionId: decisions[0].id,
            }),
            completeLifeAction(
              createReadyLifeAction('completed', DayDate.create('2026-08-05'), {
                decisionId: decisions[0].id,
              }),
            ),
          ]
        : [],
    ),
  };
  const actionSessionReader: ActionSessionsByLifeActionIdsReader = {
    findByLifeActionIds: vi.fn().mockImplementation((ids: readonly EntityId[]) =>
      Promise.resolve(
        withExecutionFacts && ids[1] !== undefined
          ? [
              ActionSession.rehydrate({
                id: EntityId.create('completed-session'),
                lifeActionId: ids[1],
                status: 'completed',
                startedAt: new Date('2026-08-05T09:00:00.000Z'),
                pausedAt: null,
                completedAt: new Date('2026-08-05T10:00:00.000Z'),
                completionKind: SESSION_COMPLETION_KIND.completed,
                resultNote: null,
                pauseIntervals: [],
                version: 2,
              }),
            ]
          : [],
      ),
    ),
  };
  const currentDate: CurrentDateProvider = {
    getCurrentDate: vi.fn().mockReturnValue(DayDate.create('2026-08-05')),
  };
  return {
    query: new GetDirectionPortfolio(
      directionRepository,
      projectRepository,
      decisionReader,
      lifeActionReader,
      actionSessionReader,
      currentDate,
    ),
    directionRepository,
    projectRepository,
    decisionReader,
    lifeActionReader,
    actionSessionReader,
  };
}

describe('GetDirectionPortfolio', () => {
  it('builds portfolio groups and no_active_project without per-project reads', async () => {
    const app = setup([project('paused', 'paused'), project('completed', 'completed')]);

    await expect(app.query.execute(DIRECTION_ID)).resolves.toMatchObject({
      mainProject: null,
      activeProjects: [],
      pausedProjects: [{ title: 'paused' }],
      completedProjects: [{ title: 'completed' }],
      operationalState: DIRECTION_OPERATIONAL_STATE.noActiveProject,
      counts: { active: 0, paused: 1, completed: 1 },
    });
    expect(app.projectRepository.findByDirectionId).toHaveBeenCalledTimes(1);
    expect(app.decisionReader.findByProjectIds).toHaveBeenCalledTimes(1);
    expect(app.lifeActionReader.findByDecisionIds).not.toHaveBeenCalled();
    expect(app.actionSessionReader.findByLifeActionIds).not.toHaveBeenCalled();
  });

  it('separates the main project and reports moving for a working decision', async () => {
    const main = project('main', 'active', true);
    const active = project('active', 'active');
    const app = setup([main, active], true);

    await expect(app.query.execute(DIRECTION_ID)).resolves.toMatchObject({
      mainProject: { title: 'main' },
      activeProjects: [{ title: 'active' }],
      operationalState: DIRECTION_OPERATIONAL_STATE.moving,
      counts: { active: 2, paused: 0, completed: 0 },
    });
    expect(app.decisionReader.findByProjectIds).toHaveBeenCalledWith([main.id, active.id]);
  });

  it('reports no_execution when active projects have no working decisions or actions', async () => {
    const app = setup([project('active', 'active')]);
    await expect(app.query.execute(DIRECTION_ID)).resolves.toMatchObject({
      operationalState: DIRECTION_OPERATIONAL_STATE.noExecution,
    });
  });

  it('builds pulse facts and selected-period dynamics with one bulk read per relation', async () => {
    const active = project('active', 'active');
    const app = setup([active], true, true);

    await expect(app.query.execute(DIRECTION_ID, 7)).resolves.toMatchObject({
      pulse: {
        operationalState: DIRECTION_OPERATIONAL_STATE.moving,
        activeProjectCount: 1,
        pausedProjectCount: 0,
        completedProjectCount: 0,
        activeDecisionCount: 1,
        unfinishedActionCount: 1,
        completedActionCount: 1,
        completedSessionCount: 1,
        totalActualTimeMs: 60 * 60_000,
        lastRealMovementAt: new Date('2026-08-05T10:00:00.000Z'),
        dynamics: {
          periodDays: 7,
          startDate: DayDate.create('2026-07-30'),
          endDate: DayDate.create('2026-08-05'),
          completedActionCount: 1,
          completedSessionCount: 1,
          actualTimeMs: 60 * 60_000,
        },
      },
    });
    expect(app.projectRepository.findByDirectionId).toHaveBeenCalledOnce();
    expect(app.decisionReader.findByProjectIds).toHaveBeenCalledOnce();
    expect(app.lifeActionReader.findByDecisionIds).toHaveBeenCalledOnce();
    expect(app.actionSessionReader.findByLifeActionIds).toHaveBeenCalledOnce();
  });
});
