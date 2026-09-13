import { describe, expect, it, vi } from 'vitest';
import { DayDate, Direction, EntityId, JOURNAL_ENTRY_TYPE, Project } from '../../domain';
import { InMemoryDirectionRepository, InMemoryProjectRepository } from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { CommitJournalStateInput, JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { ApplyDirectionStrategicReview } from './ApplyDirectionStrategicReview';

const NOW = new Date('2026-08-13T09:30:00.000+09:00');
const DATE = DayDate.create('2026-08-13');

describe('ApplyDirectionStrategicReview', () => {
  it('prepares direction, project transitions, main project and review fact in one commit', async () => {
    const direction = Direction.create({
      id: EntityId.create('direction-lifeos'),
      name: 'LifeOS',
      strategicIntent: 'Собрать систему',
      desiredState: 'Рабочий контур',
      now: NOW,
    });
    const main = Project.create({
      id: EntityId.create('project-main'),
      directionId: direction.id,
      title: 'Первый этап',
      isMain: true,
      now: NOW,
    });
    const next = Project.create({
      id: EntityId.create('project-next'),
      directionId: direction.id,
      title: 'Второй этап',
      now: NOW,
    });
    const commits: CommitJournalStateInput[] = [];
    const unitOfWork: JournalUnitOfWork = {
      commit: vi.fn(async (input) => {
        commits.push(input);
      }),
    };
    const command = new ApplyDirectionStrategicReview(
      new InMemoryDirectionRepository([direction]),
      new InMemoryProjectRepository([main, next]),
      unitOfWork,
      new FakeClock(NOW),
      new FakeCurrentDateProvider(DATE),
      new FakeIdGenerator('review'),
    );

    const result = await command.execute({
      directionId: direction.id,
      expectedDirectionVersion: direction.version,
      remainsRelevant: true,
      strategicIntent: 'Собрать надёжную систему',
      desiredState: 'Рабочий desktop и mobile контур',
      projectChanges: [{ id: main.id, expectedVersion: main.version, status: 'paused' }],
      mainProjectId: next.id,
      newProject: {
        title: 'Проверка курса',
        desiredResult: 'Подтверждённый следующий этап',
        makeMain: false,
      },
    });

    expect(result.ok).toBe(true);
    const committed = commits[0];
    if (!result.ok || committed === undefined) throw new Error('Review was not committed');
    expect(committed.directions).toHaveLength(1);
    expect(committed.projects).toHaveLength(3);
    expect(committed.journalEntries).toHaveLength(1);
    expect(committed.journalEntries[0]).toMatchObject({
      type: JOURNAL_ENTRY_TYPE.directionStrategicReviewed,
      effectiveDate: DATE,
      labelAtEvent: 'LifeOS',
    });
    expect(result.value.mainProject?.title).toBe('Второй этап');
    expect(result.value.createdProject?.title).toBe('Проверка курса');
    expect(result.value.reviewedAt).toEqual(NOW);
  });

  it('does not write repositories or review history when the atomic commit fails', async () => {
    const direction = Direction.create({
      id: EntityId.create('direction-safe'),
      name: 'Безопасность',
      now: NOW,
    });
    const project = Project.create({
      id: EntityId.create('project-safe'),
      directionId: direction.id,
      title: 'Исходный цель',
      isMain: true,
      now: NOW,
    });
    const directions = new InMemoryDirectionRepository([direction]);
    const projects = new InMemoryProjectRepository([project]);
    const unitOfWork: JournalUnitOfWork = {
      commit: vi.fn(async () => {
        throw new Error('transaction aborted');
      }),
    };
    const command = new ApplyDirectionStrategicReview(
      directions,
      projects,
      unitOfWork,
      new FakeClock(NOW),
      new FakeCurrentDateProvider(DATE),
      new FakeIdGenerator('review'),
    );

    const result = await command.execute({
      directionId: direction.id,
      expectedDirectionVersion: direction.version,
      remainsRelevant: true,
      strategicIntent: 'Новый замысел',
      desiredState: null,
      projectChanges: [{ id: project.id, expectedVersion: project.version, status: 'archived' }],
      mainProjectId: null,
      newProject: null,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await directions.findById(direction.id)).toBe(direction);
    expect(await projects.findById(project.id)).toBe(project);
  });
});
