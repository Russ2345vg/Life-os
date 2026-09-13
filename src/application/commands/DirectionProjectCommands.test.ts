import { describe, expect, it } from 'vitest';
import { DECISION_KIND, Decision, DecisionTitle, EntityId, Project } from '../../domain';
import {
  InMemoryDecisionRepository,
  InMemoryDirectionRepository,
  InMemoryProjectRepository,
} from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { GetDirections } from '../queries/GetDirections';
import { GetDirectionsForSphere } from '../queries/GetDirectionsForSphere';
import { GetDirectionsOverview } from '../queries/GetDirectionsOverview';
import { GetProjectById } from '../queries/GetProjectById';
import { GetProjects } from '../queries/GetProjects';
import { GetProjectsForDirection } from '../queries/GetProjectsForDirection';
import { GetProjectsForSphere } from '../queries/GetProjectsForSphere';
import { ArchiveDirection } from './ArchiveDirection';
import { ArchiveProject } from './ArchiveProject';
import { CompleteProject } from './CompleteProject';
import { CreateDirection } from './CreateDirection';
import { CreateProject } from './CreateProject';
import { PauseProject } from './PauseProject';
import { RestoreDirection } from './RestoreDirection';
import { RestoreProject } from './RestoreProject';
import { ResumeProject } from './ResumeProject';
import { UpdateDirection } from './UpdateDirection';
import { MakeDirectionMain } from './MakeDirectionMain';
import { MakeProjectMain } from './MakeProjectMain';
import { EnsureSingleMainProject } from './EnsureSingleMainProject';
import { UpdateProject } from './UpdateProject';

function setup() {
  const directions = new InMemoryDirectionRepository();
  const projects = new InMemoryProjectRepository();
  const decisions = new InMemoryDecisionRepository();
  const clock = new FakeClock(new Date('2026-08-10T08:00:00.000Z'));
  return {
    directions,
    projects,
    decisions,
    clock,
    createDirection: new CreateDirection(directions, clock, new FakeIdGenerator('direction')),
    updateDirection: new UpdateDirection(directions, projects, clock),
    archiveDirection: new ArchiveDirection(directions, clock),
    restoreDirection: new RestoreDirection(directions, clock),
    makeDirectionMain: new MakeDirectionMain(directions, clock),
    createProject: new CreateProject(projects, directions, clock, new FakeIdGenerator('project')),
    updateProject: new UpdateProject(projects, directions, clock, decisions),
    pauseProject: new PauseProject(projects, clock),
    resumeProject: new ResumeProject(projects, clock),
    completeProject: new CompleteProject(projects, clock),
    archiveProject: new ArchiveProject(projects, clock),
    restoreProject: new RestoreProject(projects, clock),
    makeProjectMain: new MakeProjectMain(projects, clock),
  };
}

describe('Direction and Project commands', () => {
  it('creates, updates, archives, restores and queries directions', async () => {
    const app = setup();
    const sphereId = EntityId.create('sphere-1');
    const standalone = await app.createDirection.execute({
      name: 'Работа',
      strategicIntent: 'Развивать профессиональный капитал',
      desiredState: 'Устойчивая самостоятельная практика',
      inScope: 'Продукты и профессиональные навыки',
      outOfScope: 'Разовые бытовые задачи',
    });
    const linked = await app.createDirection.execute({ sphereId, name: 'Продукт' });
    if (!standalone.ok || !linked.ok) throw new Error('Directions were not created');
    const updated = await app.updateDirection.execute({
      id: standalone.value.id,
      expectedVersion: 1,
      name: 'Профессия',
      strategicIntent: 'Создавать значимые продукты',
    });
    if (!updated.ok) throw updated.error;
    const archived = await app.archiveDirection.execute({
      id: updated.value.id,
      expectedVersion: 2,
    });
    if (!archived.ok) throw archived.error;
    const restored = await app.restoreDirection.execute({
      id: archived.value.id,
      expectedVersion: 3,
    });

    expect(restored).toMatchObject({
      ok: true,
      value: {
        status: 'active',
        strategicIntent: 'Создавать значимые продукты',
        desiredState: 'Устойчивая самостоятельная практика',
        inScope: 'Продукты и профессиональные навыки',
        outOfScope: 'Разовые бытовые задачи',
        version: 4,
      },
    });
    expect(await new GetDirections(app.directions).execute()).toHaveLength(2);
    expect(await new GetDirectionsForSphere(app.directions).execute(sphereId)).toMatchObject([
      { name: 'Продукт' },
    ]);
  });

  it('creates standalone, sphere and direction projects and returns them through queries', async () => {
    const app = setup();
    const sphereId = EntityId.create('sphere-1');
    const direction = await app.createDirection.execute({ sphereId, name: 'Продукт' });
    if (!direction.ok) throw direction.error;
    const standalone = await app.createProject.execute({ title: 'Без связей' });
    const withSphere = await app.createProject.execute({ sphereId, title: 'В сфере' });
    const withDirection = await app.createProject.execute({
      directionId: direction.value.id,
      title: 'В направлении',
      desiredResult: 'Готовый результат',
    });
    if (!standalone.ok || !withSphere.ok || !withDirection.ok) throw new Error('Projects failed');

    expect(await new GetProjects(app.projects).execute()).toHaveLength(3);
    expect(await new GetProjectsForSphere(app.projects).execute(sphereId)).toHaveLength(2);
    expect(
      await new GetProjectsForDirection(app.projects).execute(direction.value.id),
    ).toHaveLength(1);
    expect(await new GetProjectById(app.projects).execute(standalone.value.id)).toMatchObject({
      title: 'Без связей',
    });
  });

  it('checks sphere compatibility when both references are set', async () => {
    const app = setup();
    const direction = await app.createDirection.execute({
      sphereId: EntityId.create('sphere-a'),
      name: 'Продукт',
    });
    if (!direction.ok) throw direction.error;

    expect(
      await app.createProject.execute({
        sphereId: EntityId.create('sphere-b'),
        directionId: direction.value.id,
        title: 'Несовместимый цель',
      }),
    ).toMatchObject({ ok: false, error: { code: 'project.direction_sphere_mismatch' } });

    expect(
      await app.createProject.execute({
        sphereId: null,
        directionId: direction.value.id,
        title: 'Цель без обязательного контекста сферы',
      }),
    ).toMatchObject({ ok: false, error: { code: 'project.direction_sphere_mismatch' } });
  });

  it('blocks a project sphere change that would contradict linked decisions', async () => {
    const app = setup();
    const sphereA = EntityId.create('sphere-project-a');
    const project = await app.createProject.execute({ sphereId: sphereA, title: 'Связанный' });
    if (!project.ok) throw project.error;
    await app.decisions.save(
      Decision.createDraft({
        id: EntityId.create('decision-project-sphere'),
        title: DecisionTitle.create('Связанное решение'),
        kind: DECISION_KIND.additional,
        sphereId: sphereA,
        projectId: project.value.id,
        occurredAt: new Date('2026-08-10T08:00:00.000Z'),
        eventId: EntityId.create('decision-project-sphere-event'),
      }),
    );

    const result = await app.updateProject.execute({
      id: project.value.id,
      expectedVersion: project.value.version,
      sphereId: EntityId.create('sphere-project-b'),
      title: project.value.title,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'project.decision_sphere_mismatch' },
    });
    expect((await app.projects.findById(project.value.id))?.sphereId?.toString()).toBe(
      'sphere-project-a',
    );
  });

  it('inherits direction context when a project is created inside a direction', async () => {
    const app = setup();
    const sphereId = EntityId.create('sphere-context');
    const direction = await app.createDirection.execute({ sphereId, name: 'Продукт' });
    if (!direction.ok) throw direction.error;

    const project = await app.createProject.execute({
      directionId: direction.value.id,
      title: 'Новый релиз',
    });

    expect(project).toMatchObject({
      ok: true,
      value: { directionId: direction.value.id, sphereId },
    });
  });

  it('blocks a direction sphere move that would contradict linked projects', async () => {
    const app = setup();
    const sphereA = EntityId.create('sphere-a');
    const direction = await app.createDirection.execute({ sphereId: sphereA, name: 'Продукт' });
    if (!direction.ok) throw direction.error;
    const project = await app.createProject.execute({
      directionId: direction.value.id,
      title: 'Связанный цель',
    });
    if (!project.ok) throw project.error;

    const moved = await app.updateDirection.execute({
      id: direction.value.id,
      expectedVersion: direction.value.version,
      sphereId: EntityId.create('sphere-b'),
      name: direction.value.name,
    });

    expect(moved).toMatchObject({
      ok: false,
      error: { code: 'direction.sphere_has_incompatible_projects' },
    });
    expect((await app.projects.findById(project.value.id))?.sphereId?.toString()).toBe('sphere-a');
  });

  it('keeps at most one active main direction and clears the flag on archive', async () => {
    const app = setup();
    const first = await app.createDirection.execute({ name: 'LifeOS' });
    const second = await app.createDirection.execute({ name: 'Доход' });
    if (!first.ok || !second.ok) throw new Error('Directions were not created');

    const firstMain = await app.makeDirectionMain.execute({
      id: first.value.id,
      expectedVersion: first.value.version,
    });
    const secondMain = await app.makeDirectionMain.execute({
      id: second.value.id,
      expectedVersion: second.value.version,
    });
    if (!firstMain.ok || !secondMain.ok) throw new Error('Main direction failed');

    expect((await app.directions.findAll()).filter((direction) => direction.isMain)).toMatchObject([
      { name: 'Доход' },
    ]);
    const archived = await app.archiveDirection.execute({
      id: secondMain.value.id,
      expectedVersion: secondMain.value.version,
    });
    expect(archived).toMatchObject({ ok: true, value: { isMain: false, status: 'archived' } });
  });

  it('builds project counts for all directions without storing computed values', async () => {
    const app = setup();
    const direction = await app.createDirection.execute({ name: 'LifeOS' });
    if (!direction.ok) throw direction.error;
    const active = await app.createProject.execute({
      directionId: direction.value.id,
      title: 'Активный',
    });
    const paused = await app.createProject.execute({
      directionId: direction.value.id,
      title: 'На паузе',
    });
    if (!active.ok || !paused.ok) throw new Error('Projects were not created');
    await app.pauseProject.execute({ id: paused.value.id, expectedVersion: paused.value.version });

    await expect(
      new GetDirectionsOverview(app.directions, app.projects).execute(),
    ).resolves.toMatchObject([{ activeProjectCount: 1, totalProjectCount: 2, isMain: false }]);
  });

  it('updates and performs all project lifecycle commands', async () => {
    const app = setup();
    const created = await app.createProject.execute({ title: 'Цель' });
    if (!created.ok) throw created.error;
    const updated = await app.updateProject.execute({
      id: created.value.id,
      expectedVersion: 1,
      title: 'Обновлённый цель',
    });
    if (!updated.ok) throw updated.error;
    const paused = await app.pauseProject.execute({ id: updated.value.id, expectedVersion: 2 });
    if (!paused.ok) throw paused.error;
    const resumed = await app.resumeProject.execute({ id: paused.value.id, expectedVersion: 3 });
    if (!resumed.ok) throw resumed.error;
    const completed = await app.completeProject.execute({
      id: resumed.value.id,
      expectedVersion: 4,
    });
    if (!completed.ok) throw completed.error;
    const archived = await app.archiveProject.execute({
      id: completed.value.id,
      expectedVersion: 5,
    });
    if (!archived.ok) throw archived.error;
    const restored = await app.restoreProject.execute({
      id: archived.value.id,
      expectedVersion: 6,
    });

    expect(restored).toMatchObject({
      ok: true,
      value: { title: 'Обновлённый цель', isMain: false, status: 'active', version: 7 },
    });
  });

  it('atomically replaces the main project and keeps at most one active main', async () => {
    const app = setup();
    const first = await app.createProject.execute({ title: 'Первый' });
    const second = await app.createProject.execute({ title: 'Второй' });
    if (!first.ok || !second.ok) throw new Error('Projects were not created');

    const firstMain = await app.makeProjectMain.execute({
      id: first.value.id,
      expectedVersion: first.value.version,
    });
    const secondMain = await app.makeProjectMain.execute({
      id: second.value.id,
      expectedVersion: second.value.version,
    });
    if (!firstMain.ok || !secondMain.ok) throw new Error('Main project failed');

    const projects = await app.projects.findAll();
    expect(projects.filter((project) => project.isMain)).toMatchObject([{ title: 'Второй' }]);
    expect(projects.find((project) => project.title === 'Первый')).toMatchObject({
      isMain: false,
      version: 3,
    });
  });

  it('keeps one main project per direction and can assign it during creation', async () => {
    const app = setup();
    const firstDirection = await app.createDirection.execute({ name: 'Первое' });
    const secondDirection = await app.createDirection.execute({ name: 'Второе' });
    if (!firstDirection.ok || !secondDirection.ok) throw new Error('Directions failed');
    const firstMain = await app.createProject.execute({
      directionId: firstDirection.value.id,
      title: 'Главный первого',
      makeMain: true,
    });
    const replacement = await app.createProject.execute({
      directionId: firstDirection.value.id,
      title: 'Новый главный первого',
      makeMain: true,
    });
    const secondMain = await app.createProject.execute({
      directionId: secondDirection.value.id,
      title: 'Главный второго',
      makeMain: true,
    });
    if (!firstMain.ok || !replacement.ok || !secondMain.ok) throw new Error('Projects failed');

    expect((await app.projects.findAll()).filter((project) => project.isMain)).toMatchObject([
      { title: 'Новый главный первого' },
      { title: 'Главный второго' },
    ]);
    expect(await app.projects.findById(firstMain.value.id)).toMatchObject({
      isMain: false,
      version: 2,
    });
  });

  it('reconciles legacy duplicate active main projects on startup', async () => {
    const app = setup();
    const first = await app.projects.create(
      Project.create({
        id: EntityId.create('legacy-main-a'),
        title: 'Первый старый главный',
        isMain: true,
        now: new Date('2026-08-10T07:00:00.000Z'),
      }),
    );
    const second = await app.projects.create(
      Project.create({
        id: EntityId.create('legacy-main-b'),
        title: 'Последний старый главный',
        isMain: true,
        now: new Date('2026-08-10T08:00:00.000Z'),
      }),
    );
    expect(first && second).toBe(true);

    await new EnsureSingleMainProject(app.projects, app.clock).execute();

    expect((await app.projects.findAll()).filter((project) => project.isMain)).toMatchObject([
      { title: 'Последний старый главный' },
    ]);
  });

  it('clears main on pause and does not restore it on resume', async () => {
    const app = setup();
    const created = await app.createProject.execute({ title: 'Главный' });
    if (!created.ok) throw created.error;
    const main = await app.makeProjectMain.execute({
      id: created.value.id,
      expectedVersion: created.value.version,
    });
    if (!main.ok) throw main.error;
    const paused = await app.pauseProject.execute({
      id: main.value.id,
      expectedVersion: main.value.version,
    });
    if (!paused.ok) throw paused.error;
    const resumed = await app.resumeProject.execute({
      id: paused.value.id,
      expectedVersion: paused.value.version,
    });

    expect(paused.value).toMatchObject({ status: 'paused', isMain: false });
    expect(resumed).toMatchObject({ ok: true, value: { status: 'active', isMain: false } });
  });

  it('clears main on complete and archive, and restores archived projects as non-main active', async () => {
    const app = setup();
    const completedSource = await app.createProject.execute({ title: 'Завершить' });
    const archivedSource = await app.createProject.execute({ title: 'Архивировать' });
    if (!completedSource.ok || !archivedSource.ok) throw new Error('Projects were not created');

    const completedMain = await app.makeProjectMain.execute({
      id: completedSource.value.id,
      expectedVersion: completedSource.value.version,
    });
    if (!completedMain.ok) throw completedMain.error;
    const completed = await app.completeProject.execute({
      id: completedMain.value.id,
      expectedVersion: completedMain.value.version,
    });
    if (!completed.ok) throw completed.error;

    const archivedMain = await app.makeProjectMain.execute({
      id: archivedSource.value.id,
      expectedVersion: archivedSource.value.version,
    });
    if (!archivedMain.ok) throw archivedMain.error;
    const archived = await app.archiveProject.execute({
      id: archivedMain.value.id,
      expectedVersion: archivedMain.value.version,
    });
    if (!archived.ok) throw archived.error;
    const restored = await app.restoreProject.execute({
      id: archived.value.id,
      expectedVersion: archived.value.version,
    });

    expect(completed.value).toMatchObject({ status: 'completed', isMain: false });
    expect(archived.value).toMatchObject({ status: 'archived', isMain: false });
    expect(restored).toMatchObject({ ok: true, value: { status: 'active', isMain: false } });
  });
});
