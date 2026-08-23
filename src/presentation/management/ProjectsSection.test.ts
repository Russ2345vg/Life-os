import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PROJECT_HISTORY_EVENT_KIND,
  type ProjectHistoryEvent,
  type ProjectHistorySummary,
} from '../../application';
import {
  DECISION_KIND,
  Decision,
  DecisionTitle,
  Direction,
  EntityId,
  Project,
  Sphere,
  DayDate,
} from '../../domain';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { EmptyProjects, ProjectCard, ProjectDetails, ProjectForm } from './ProjectsSection';
import { sortProjects } from './projectSorting';

const NOW = new Date('2026-08-10T08:00:00.000Z');

describe('Projects presentation', () => {
  it('renders a compact card with result, direction, sphere, status and main marker', () => {
    const sphere = Sphere.create({ id: EntityId.create('sphere'), name: 'Продукт', now: NOW });
    const direction = Direction.create({
      id: EntityId.create('direction'),
      sphereId: sphere.id,
      name: 'Развитие LifeOS',
      now: NOW,
    });
    const project = Project.create({
      id: EntityId.create('project'),
      sphereId: sphere.id,
      directionId: direction.id,
      title: 'Переработать Управление',
      desiredResult: 'Создать единый рабочий центр LifeOS',
      isMain: true,
      now: NOW,
    });

    const markup = renderToStaticMarkup(
      createElement(ProjectCard, {
        project,
        direction,
        sphere,
        busy: false,
        onOpen: vi.fn(),
        onEdit: vi.fn(),
        onAction: vi.fn(),
      }),
    );

    expect(markup).toContain('Переработать Управление');
    expect(markup).toContain('Создать единый рабочий центр LifeOS');
    expect(markup).toContain('Развитие LifeOS');
    expect(markup).toContain('Продукт');
    expect(markup).toContain('aria-label="Главный проект"');
    expect(markup).toContain('Активный');
    expect(markup).toContain('<details');
    expect(markup).not.toContain('%');
  });

  it('renders Project Details with linked decisions and without fictitious progress', () => {
    const project = Project.create({
      id: EntityId.create('project'),
      title: 'Новый релиз',
      description: 'Подготовить стабильную версию.',
      desiredResult: 'Версия опубликована.',
      now: NOW,
    });
    const decision = Decision.createDraft({
      id: EntityId.create('decision'),
      title: DecisionTitle.create('Подготовить changelog'),
      kind: DECISION_KIND.additional,
      projectId: project.id,
      occurredAt: NOW,
      eventId: EntityId.create('decision-event'),
    });
    const lifeAction = createReadyLifeAction('подготовить-сборку', DayDate.create('2026-08-11'), {
      decisionId: decision.id,
    });
    const markup = renderToStaticMarkup(
      createElement(ProjectDetails, {
        project,
        direction: null,
        sphere: null,
        busy: false,
        message: null,
        error: null,
        decisions: [decision],
        lifeActions: [lifeAction],
        history: [
          {
            id: 'decision-created:decision',
            kind: PROJECT_HISTORY_EVENT_KIND.decisionCreated,
            occurredAt: NOW,
            subjectTitle: decision.title.toString(),
            projectStatus: null,
          } satisfies ProjectHistoryEvent,
        ],
        summary: {
          decisionCount: 1,
          completedLifeActionCount: 0,
          completedActionSessionCount: 0,
          totalActionDurationMs: 0,
        } satisfies ProjectHistorySummary,
        onBack: vi.fn(),
        onOpenDirection: vi.fn(),
        onEdit: vi.fn(),
        onCreateDecision: vi.fn(),
        onAction: vi.fn(),
      }),
    );

    expect(markup).toContain('Версия опубликована.');
    expect(markup).toContain('Подготовить стабильную версию.');
    expect(markup).toContain('Подготовить changelog');
    expect(markup).toContain('Действие подготовить-сборку');
    expect(markup).toContain('Готово');
    expect(markup).toContain('+ Решение');
    expect(markup).toContain('Итог проекта');
    expect(markup).toContain('История');
    expect(markup).toContain('Создано решение');
    expect(markup).toContain('Время действия');
    expect(markup).not.toContain('74%');
  });

  it('keeps create/edit fields limited to the approved Project data', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectForm, {
        mode: 'create',
        draft: { title: '', description: '', desiredResult: '', directionId: '', sphereId: '' },
        directions: [],
        spheres: { active: [], archived: [] },
        saving: false,
        error: null,
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('Название');
    expect(markup).toContain('Желаемый результат');
    expect(markup).toContain('Описание');
    expect(markup).toContain('Направление');
    expect(markup).toContain('Сфера');
    expect(markup).toContain('premium-form-content');
    expect(markup).toContain('premium-form-grid');
    expect(markup).toContain('Сформулируйте конкретный результат');
    expect(markup).toContain('Создать проект');
    expect(markup).not.toContain('KPI');
    expect(markup).not.toContain('Прогресс');
  });

  it('sorts main first, then active, then by most recent update', () => {
    const oldActive = Project.create({ id: EntityId.create('old'), title: 'Старый', now: NOW });
    const paused = Project.create({
      id: EntityId.create('paused'),
      title: 'Пауза',
      now: NOW,
    }).pause(new Date('2026-08-10T10:00:00.000Z'));
    const main = Project.create({
      id: EntityId.create('main'),
      title: 'Главный',
      isMain: true,
      now: NOW,
    });

    expect(sortProjects([paused, oldActive, main]).map((project) => project.title)).toEqual([
      'Главный',
      'Старый',
      'Пауза',
    ]);
  });

  it('renders the explanatory empty state', () => {
    const markup = renderToStaticMarkup(createElement(EmptyProjects, { onCreate: vi.fn() }));
    expect(markup).toContain('Пока нет проектов');
    expect(markup).toContain('конкретный завершённый результат');
    expect(markup).toContain('Создать проект');
  });
});
