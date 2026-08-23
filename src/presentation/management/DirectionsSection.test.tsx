import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, Direction, EntityId, Project, Sphere } from '../../domain';
import {
  DirectionCard,
  DirectionForm,
  DirectionPulsePanel,
  DirectionStrategicOutline,
  DirectionPortfolioSummary,
  EmptyDirections,
  DirectionStrategicReview,
} from './DirectionsSection';

const NOW = new Date('2026-08-10T08:00:00.000Z');

describe('Directions presentation', () => {
  it('renders a compact main card with real project counts and a mobile-accessible menu', () => {
    const sphere = Sphere.create({
      id: EntityId.create('sphere-product'),
      name: 'Продукт',
      now: NOW,
    });
    const direction = Direction.create({
      id: EntityId.create('direction-lifeos'),
      sphereId: sphere.id,
      name: 'Развитие LifeOS',
      description: 'Создание и развитие собственной системы LifeOS',
      isMain: true,
      now: NOW,
    });
    const markup = renderToStaticMarkup(
      createElement(DirectionCard, {
        item: { direction, activeProjectCount: 2, totalProjectCount: 3, isMain: true },
        spheres: { active: [sphere], archived: [] },
        busy: false,
        onOpen: vi.fn(),
        onEdit: vi.fn(),
        onMakeMain: vi.fn(),
        onArchive: vi.fn(),
        onRestore: undefined,
      }),
    );

    expect(markup).toContain('Развитие LifeOS');
    expect(markup).toContain('3 проекта');
    expect(markup).toContain('2 активных');
    expect(markup).toContain('aria-label="Главное направление"');
    expect(markup).toContain('<details');
    expect(markup).toContain('Редактировать');
    expect(markup).not.toContain('Сделать главным');
  });

  it('renders the explanatory empty state with its create action', () => {
    const markup = renderToStaticMarkup(createElement(EmptyDirections, { onCreate: vi.fn() }));
    expect(markup).toContain('Пока нет направлений');
    expect(markup).toContain('долгосрочный вектор движения');
    expect(markup).toContain('Создать направление');
  });

  it('keeps the create form limited to name, description and optional sphere', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionForm, {
        mode: 'create',
        draft: {
          name: '',
          description: '',
          strategicIntent: '',
          desiredState: '',
          inScope: '',
          outOfScope: '',
          sphereId: '',
        },
        spheres: { active: [], archived: [] },
        saving: false,
        error: null,
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );
    expect(markup).toContain('Название');
    expect(markup).toContain('Короткое описание');
    expect(markup).toContain('Сфера');
    expect(markup).toContain('Создать направление');
    expect(markup).toContain('Отмена');
    expect(markup).toContain('direction-create-form');
    expect(markup).toContain('rows="2"');
    expect(markup).toContain('Можно выбрать позже');
    expect(markup).not.toContain('необязательно');
    expect(markup.indexOf('Отмена')).toBeLessThan(markup.indexOf('Создать направление'));
    expect(markup).not.toContain('KPI');
    expect(markup).not.toContain('Срок');
    expect(markup).not.toContain('Стратегический контур');
  });

  it('shows strategic fields in the existing edit form', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionForm, {
        mode: 'edit',
        draft: {
          name: 'LifeOS',
          description: '',
          strategicIntent: 'Создать систему управления жизнью',
          desiredState: 'Целостная работающая система',
          inScope: 'Продукт',
          outOfScope: 'Заказная разработка',
          sphereId: '',
        },
        spheres: { active: [], archived: [] },
        saving: false,
        error: null,
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('Стратегический контур');
    expect(markup).toContain('Замысел');
    expect(markup).toContain('Желаемое состояние');
    expect(markup).toContain('Входит');
    expect(markup).toContain('Не входит');
  });

  it('renders strategic details and a calm setup action when they are empty', () => {
    const configured = Direction.create({
      id: EntityId.create('direction-configured'),
      name: 'LifeOS',
      strategicIntent: 'Создать систему управления жизнью',
      desiredState: 'Целостная работающая система',
      inScope: 'Продукт',
      outOfScope: 'Заказная разработка',
      now: NOW,
    });
    const empty = Direction.create({
      id: EntityId.create('direction-empty'),
      name: 'Новое направление',
      now: NOW,
    });
    const configuredMarkup = renderToStaticMarkup(
      createElement(DirectionStrategicOutline, {
        direction: configured,
        onConfigure: vi.fn(),
      }),
    );
    const emptyMarkup = renderToStaticMarkup(
      createElement(DirectionStrategicOutline, { direction: empty, onConfigure: vi.fn() }),
    );

    expect(configuredMarkup).toContain('Стратегический контур');
    expect(configuredMarkup).toContain('Создать систему управления жизнью');
    expect(configuredMarkup).not.toContain('Настроить направление');
    expect(emptyMarkup).toContain('Стратегический контур не настроен');
    expect(emptyMarkup).toContain('Определите замысел, желаемое состояние и границы.');
    expect(emptyMarkup).toContain('Настроить →');
  });

  it('renders the compact portfolio operational state and counts', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionPortfolioSummary, {
        operationalState: 'no_execution',
        activeCount: 2,
        pausedCount: 1,
        completedCount: 3,
      }),
    );
    expect(markup).toContain('Нет исполнения');
    expect(markup).toContain('2 активных');
    expect(markup).toContain('1 приостановленных');
    expect(markup).toContain('3 завершённых');
  });

  it('renders pulse facts and trustworthy dynamics for the selected period', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionPulsePanel, {
        pulse: {
          operationalState: 'moving',
          activeProjectCount: 2,
          pausedProjectCount: 1,
          completedProjectCount: 3,
          activeDecisionCount: 4,
          unfinishedActionCount: 5,
          completedActionCount: 6,
          completedSessionCount: 7,
          totalActualTimeMs: 8 * 60 * 60_000 + 30 * 60_000,
          lastRealMovementAt: new Date('2026-08-10T08:00:00.000Z'),
          dynamics: {
            periodDays: 7,
            startDate: DayDate.create('2026-08-04'),
            endDate: DayDate.create('2026-08-10'),
            completedActionCount: 2,
            completedSessionCount: 3,
            actualTimeMs: 90 * 60_000,
          },
        },
        onPeriodChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Движение');
    expect(markup).toContain('Движется');
    expect(markup).toContain('4</dd>');
    expect(markup).toContain('5 незавершённых');
    expect(markup).toContain('6 выполнено');
    expect(markup).toContain('8 ч 30 мин');
    expect(markup).toContain('7 завершённых сессий');
    expect(markup).toContain('2 выполненных действий');
    expect(markup).toContain('3 сессий');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('renders movement as a compact empty state when activity is absent', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionPulsePanel, {
        pulse: {
          operationalState: 'no_active_project',
          activeProjectCount: 0,
          pausedProjectCount: 0,
          completedProjectCount: 0,
          activeDecisionCount: 0,
          unfinishedActionCount: 0,
          completedActionCount: 0,
          completedSessionCount: 0,
          totalActualTimeMs: 0,
          lastRealMovementAt: null,
          dynamics: {
            periodDays: 7,
            startDate: DayDate.create('2026-08-04'),
            endDate: DayDate.create('2026-08-10'),
            completedActionCount: 0,
            completedSessionCount: 0,
            actualTimeMs: 0,
          },
        },
        onPeriodChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Активность пока не зафиксирована.');
    expect(markup).not.toContain('direction-pulse-metrics');
    expect(markup).not.toContain('0 мин');
    expect(markup).not.toContain('За период');
  });

  it('renders real overview facts, guided questions and explicit confirmation for review', () => {
    const direction = Direction.create({
      id: EntityId.create('direction-review'),
      name: 'LifeOS',
      strategicIntent: 'Единая система',
      desiredState: 'Рабочее приложение',
      now: NOW,
    });
    const project = Project.create({
      id: EntityId.create('project-review'),
      directionId: direction.id,
      title: 'D4 Review',
      isMain: true,
      now: NOW,
    });
    const snapshot = {
      direction,
      mainProject: project,
      activeProjects: [],
      pausedProjects: [],
      completedProjects: [],
      archivedProjects: [],
      projects: [project],
      operationalState: 'moving' as const,
      counts: { active: 1, paused: 0, completed: 0 },
      lastStrategicReviewAt: null,
      pulse: {
        operationalState: 'moving' as const,
        activeProjectCount: 1,
        pausedProjectCount: 0,
        completedProjectCount: 0,
        activeDecisionCount: 2,
        unfinishedActionCount: 3,
        completedActionCount: 4,
        completedSessionCount: 5,
        totalActualTimeMs: 90 * 60_000,
        lastRealMovementAt: NOW,
        dynamics: {
          periodDays: 7 as const,
          startDate: DayDate.create('2026-08-04'),
          endDate: DayDate.create('2026-08-10'),
          completedActionCount: 1,
          completedSessionCount: 1,
          actualTimeMs: 60_000,
        },
      },
    };
    const draft = {
      remainsRelevant: true,
      strategicIntent: 'Единая система',
      desiredState: 'Рабочее приложение',
      mainProjectId: project.id.toString(),
      projectStatuses: { [project.id.toString()]: 'active' as const },
      createProject: false,
      newProjectTitle: '',
      newProjectDesiredResult: '',
      newProjectIsMain: false,
    };
    const questions = renderToStaticMarkup(
      createElement(DirectionStrategicReview, {
        snapshot,
        state: { status: 'questions', draft },
        saving: false,
        onChange: vi.fn(),
        onSummary: vi.fn(),
        onBack: vi.fn(),
        onApply: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const summary = renderToStaticMarkup(
      createElement(DirectionStrategicReview, {
        snapshot,
        state: { status: 'summary', draft },
        saving: false,
        onChange: vi.fn(),
        onSummary: vi.fn(),
        onBack: vi.fn(),
        onApply: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    for (const label of [
      'Стратегический замысел',
      'Желаемое состояние',
      'Главный проект',
      'Проекты',
      'Решения',
      'Действия',
      'Сессии',
      'Фактическое время',
      'Последнее движение',
      'Текущее состояние направления',
    ])
      expect(questions).toContain(label);
    expect(questions).toContain('Направление всё ещё актуально?');
    expect(questions).toContain('Какой проект сейчас должен быть главным?');
    expect(questions).toContain('Нужен ли новый проект?');
    expect(summary).toContain('Подтвердить и применить');
    expect(summary).toContain('одной операцией');
    expect(questions).not.toContain('KPI');
    expect(questions).not.toContain('0–100');
    expect(questions).not.toMatch(/Project|Projects|Decisions|Actions|Sessions|Direction/);
  });
});
