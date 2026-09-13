import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { Project } from './Project';

const now = new Date('2026-08-10T08:00:00.000Z');

describe('Project', () => {
  it('creates a standalone project and keeps desiredResult and isMain separate from status', () => {
    const project = Project.create({
      id: EntityId.create('project-1'),
      title: ' Запуск продукта ',
      desiredResult: 'Первая стабильная версия',
      isMain: true,
      now,
    });

    expect(project).toMatchObject({
      sphereId: null,
      directionId: null,
      title: 'Запуск продукта',
      desiredResult: 'Первая стабильная версия',
      status: 'active',
      isMain: true,
      version: 1,
    });
  });

  it('supports sphere and direction independently', () => {
    const sphereId = EntityId.create('sphere-1');
    const directionId = EntityId.create('direction-1');
    const withSphere = Project.create({
      id: EntityId.create('project-1'),
      sphereId,
      title: 'A',
      now,
    });
    const withDirection = Project.create({
      id: EntityId.create('project-2'),
      directionId,
      title: 'B',
      now,
    });

    expect(withSphere.sphereId?.equals(sphereId)).toBe(true);
    expect(withSphere.directionId).toBeNull();
    expect(withDirection.directionId?.equals(directionId)).toBe(true);
    expect(withDirection.sphereId).toBeNull();
  });

  it('pauses, resumes, completes, archives and restores', () => {
    const project = Project.create({ id: EntityId.create('project-1'), title: 'Цель', now });
    const paused = project.pause(new Date('2026-08-10T09:00:00.000Z'));
    const resumed = paused.resume(new Date('2026-08-10T10:00:00.000Z'));
    const completed = resumed.complete(new Date('2026-08-10T11:00:00.000Z'));
    const archived = completed.archive(new Date('2026-08-10T12:00:00.000Z'));
    const restored = archived.restore(new Date('2026-08-10T13:00:00.000Z'));

    expect(paused.status).toBe('paused');
    expect(resumed.status).toBe('active');
    expect(completed.status).toBe('completed');
    expect(archived.status).toBe('archived');
    expect(restored).toMatchObject({ status: 'active', version: 6 });
  });

  it('allows main only for active projects and clears it on lifecycle transitions', () => {
    const main = Project.create({
      id: EntityId.create('project-main'),
      title: 'Главный',
      isMain: true,
      now,
    });
    const paused = main.pause(new Date('2026-08-10T09:00:00.000Z'));
    const resumed = paused.resume(new Date('2026-08-10T10:00:00.000Z'));

    expect(paused).toMatchObject({ status: 'paused', isMain: false });
    expect(resumed).toMatchObject({ status: 'active', isMain: false });
    expect(() => paused.makeMain(new Date('2026-08-10T11:00:00.000Z'))).toThrowError(
      'Только активную цель можно сделать главной.',
    );
  });
});
