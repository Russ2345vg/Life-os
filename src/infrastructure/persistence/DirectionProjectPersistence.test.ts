import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { Direction, EntityId, Project } from '../../domain';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { ProjectRecordMapper } from './mappers/ProjectRecordMapper';
import { IndexedDbDirectionRepository } from './IndexedDbDirectionRepository';
import { IndexedDbProjectRepository } from './IndexedDbProjectRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const now = new Date('2026-08-10T08:00:00.000Z');

describe('Direction and Project persistence', () => {
  it('roundtrips direction and project records', () => {
    const sphereId = EntityId.create('sphere-1');
    const direction = Direction.create({
      id: EntityId.create('direction-1'),
      sphereId,
      name: 'Продукт',
      description: 'Развитие продукта',
      strategicIntent: 'Создать личную операционную систему',
      desiredState: 'Система поддерживает ежедневное управление',
      inScope: 'Продукт и методология',
      outOfScope: 'Заказная разработка',
      now,
    });
    const project = Project.create({
      id: EntityId.create('project-1'),
      sphereId,
      directionId: direction.id,
      title: 'Релиз',
      desiredResult: 'Стабильная версия',
      isMain: true,
      now,
    });

    expect(DirectionRecordMapper.fromRecord(DirectionRecordMapper.toRecord(direction))).toEqual(
      direction,
    );
    expect(ProjectRecordMapper.fromRecord(ProjectRecordMapper.toRecord(project))).toEqual(project);
  });

  it('rehydrates directions created before the main flag as non-main', () => {
    const direction = Direction.create({
      id: EntityId.create('legacy-direction'),
      name: 'Старое направление',
      now,
    });
    const legacyRecord = { ...DirectionRecordMapper.toRecord(direction) };
    Reflect.deleteProperty(legacyRecord, 'isMain');

    expect(DirectionRecordMapper.fromRecord(legacyRecord).isMain).toBe(false);
  });

  it('rehydrates old direction records without strategic fields', () => {
    const direction = Direction.create({
      id: EntityId.create('legacy-strategic-direction'),
      name: 'Старое направление',
      now,
    });
    const legacyRecord = { ...DirectionRecordMapper.toRecord(direction) };
    Reflect.deleteProperty(legacyRecord, 'strategicIntent');
    Reflect.deleteProperty(legacyRecord, 'desiredState');
    Reflect.deleteProperty(legacyRecord, 'inScope');
    Reflect.deleteProperty(legacyRecord, 'outOfScope');

    expect(DirectionRecordMapper.fromRecord(legacyRecord)).toMatchObject({
      strategicIntent: null,
      desiredState: null,
      inScope: null,
      outOfScope: null,
    });
  });

  it('normalizes an inactive legacy main project without rewriting the record', () => {
    const project = Project.create({
      id: EntityId.create('legacy-main-project'),
      title: 'Старый главный проект',
      isMain: true,
      now,
    });
    const legacyRecord = {
      ...ProjectRecordMapper.toRecord(project),
      status: 'paused' as const,
    };

    expect(ProjectRecordMapper.fromRecord(legacyRecord)).toMatchObject({
      status: 'paused',
      isMain: false,
    });
  });

  it('saves, reads and updates records after database reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const directions = new IndexedDbDirectionRepository(firstDatabase);
    const projects = new IndexedDbProjectRepository(firstDatabase);
    const direction = Direction.create({
      id: EntityId.create('direction-1'),
      name: 'Продукт',
      now,
    });
    const project = Project.create({
      id: EntityId.create('project-1'),
      directionId: direction.id,
      title: 'Релиз',
      now,
    });
    expect(await directions.create(direction)).toBe(true);
    expect(await projects.create(project)).toBe(true);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopenedDirections = new IndexedDbDirectionRepository(reopenedDatabase);
    const reopenedProjects = new IndexedDbProjectRepository(reopenedDatabase);
    const restoredDirection = await reopenedDirections.findById(direction.id);
    const restoredProject = await reopenedProjects.findById(project.id);
    if (restoredDirection === null || restoredProject === null) throw new Error('Records missing');
    const updatedDirection = restoredDirection.update(
      { name: 'Развитие продукта' },
      new Date('2026-08-10T09:00:00.000Z'),
    );
    const updatedProject = restoredProject.update(
      { title: 'Релиз 1.0', desiredResult: 'Стабильная версия 1.0' },
      new Date('2026-08-10T09:00:00.000Z'),
    );
    expect(await reopenedDirections.updateIfVersionMatches(updatedDirection, 1)).toBe(true);
    expect(await reopenedProjects.updateIfVersionMatches(updatedProject, 1)).toBe(true);

    expect(await reopenedDirections.findById(direction.id)).toMatchObject({
      name: 'Развитие продукта',
      version: 2,
    });
    expect(await reopenedProjects.findById(project.id)).toMatchObject({
      title: 'Релиз 1.0',
      version: 2,
    });
    expect(await reopenedProjects.findByDirectionId(direction.id)).toHaveLength(1);
    reopenedDatabase.close();
  });

  it('updates the main direction switch atomically', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbDirectionRepository(database);
    const first = Direction.create({ id: EntityId.create('first'), name: 'Первое', now });
    const second = Direction.create({ id: EntityId.create('second'), name: 'Второе', now });
    await repository.create(first);
    await repository.create(second);

    expect(
      await repository.updateManyIfVersionsMatch([
        { direction: first.makeMain(now), expectedVersion: 1 },
        { direction: second, expectedVersion: 1 },
      ]),
    ).toBe(true);
    expect((await repository.findAll()).filter((direction) => direction.isMain)).toHaveLength(1);
    database.close();
  });

  it('atomically replaces the main project and persists the result after reopen', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const repository = new IndexedDbProjectRepository(database);
    const first = Project.create({
      id: EntityId.create('project-first'),
      title: 'Первый',
      isMain: true,
      now,
    });
    const second = Project.create({ id: EntityId.create('project-second'), title: 'Второй', now });
    await repository.create(first);
    await repository.create(second);

    const replacement = second.makeMain(new Date('2026-08-10T09:00:00.000Z'));
    expect(await repository.replaceMain(replacement, 1, new Date('2026-08-10T09:00:00.000Z'))).toBe(
      true,
    );
    database.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopenedRepository = new IndexedDbProjectRepository(reopenedDatabase);
    const projects = await reopenedRepository.findAll();
    expect(projects.filter((project) => project.isMain)).toMatchObject([{ title: 'Второй' }]);
    expect(projects.find((project) => project.title === 'Первый')).toMatchObject({
      isMain: false,
      version: 2,
    });
    reopenedDatabase.close();
  });
});
