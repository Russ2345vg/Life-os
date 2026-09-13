import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Direction, EntityId, Project, PROJECT_STATUS } from '../../domain';
import { ManagementDaySection } from './ManagementDaySection';
import { ManagementNavigation } from './ManagementNavigation';
import { ManagementOverviewView } from './ManagementOverview';
import { selectManagementFocus } from './managementFocus';
import { MANAGEMENT_SECTION } from './ManagementSection';
import { summarizeManagement } from './managementSummary';
import { projectStatusLabel } from './projectPresentation';

const NOW = new Date('2026-08-10T08:00:00.000Z');

describe('Management workspace', () => {
  it('оставляет один Альбом целей вместо отдельного раздела проектов', () => {
    const markup = renderToStaticMarkup(
      createElement(ManagementNavigation, {
        activeSection: MANAGEMENT_SECTION.goals,
        onOpenSection: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Разделы управления"');
    expect(markup.match(/role="tab"/g)).toHaveLength(6);
    expect(markup).not.toContain('<small>');
    expect(markup).toContain('Обзор');
    expect(markup).toContain('Направления');
    expect(markup).not.toContain('Проекты');
    expect(markup).toContain('Альбом целей');
    expect(markup).toContain('Решения');
    expect(markup).toContain('Действия');
    expect(markup).toContain('День');
    expect(markup).toMatch(/aria-selected="true"[^>]*data-group="Курс"/);
  });

  it('считает только реальные активные и приостановленные сущности', () => {
    const activeDirection = Direction.create({
      id: EntityId.create('direction-active'),
      name: 'Здоровье',
      now: NOW,
    });
    const archivedDirection = Direction.create({
      id: EntityId.create('direction-archived'),
      name: 'Архив',
      now: NOW,
    }).archive(new Date('2026-08-10T09:00:00.000Z'));
    const activeProject = Project.create({
      id: EntityId.create('project-active'),
      title: 'Активный цель',
      now: NOW,
    });
    const pausedProject = Project.create({
      id: EntityId.create('project-paused'),
      title: 'Пауза',
      now: NOW,
    }).pause(new Date('2026-08-10T09:00:00.000Z'));
    const archivedProject = Project.create({
      id: EntityId.create('project-archived'),
      title: 'Архивную цель',
      now: NOW,
    }).archive(new Date('2026-08-10T09:00:00.000Z'));

    expect(
      summarizeManagement(
        [activeDirection, archivedDirection],
        [activeProject, pausedProject, archivedProject],
      ),
    ).toEqual({
      totalDirections: 2,
      activeDirections: 1,
      totalProjects: 3,
      activeProjects: 1,
      pausedProjects: 1,
    });
  });

  it('показывает честное пустое состояние и компактные блоки рабочего Overview', () => {
    const markup = renderToStaticMarkup(
      createElement(ManagementOverviewView, {
        snapshot: {
          focus: { kind: 'empty' },
          today: {
            mainDecision: null,
            decisionCount: 0,
            actionCount: 0,
            currentSession: null,
          },
          course: { activeDirectionCount: 0, activeProjectCount: 0 },
          signals: [
            {
              kind: 'focus_undefined',
              directionId: null,
              projectId: null,
              decisionId: null,
              title: 'Фокус не определён',
              detail: 'Нет главной цели или главного направления.',
            },
          ],
        },
        onOpenSection: vi.fn(),
        onOpenProject: vi.fn(),
        onOpenDirection: vi.fn(),
        onOpenDecision: vi.fn(),
      }),
    );

    expect(markup).toContain('Фокус не определён');
    expect(markup).toContain('Сегодня');
    expect(markup).toContain('Курс');
    expect(markup).toContain('Сигналы');
    expect(markup).toContain('Активные направления');
    expect(markup).not.toContain('%');
  });

  it('показывает спокойное состояние при отсутствии критичных сигналов', () => {
    const markup = renderToStaticMarkup(
      createElement(ManagementOverviewView, {
        snapshot: {
          focus: { kind: 'direction', id: 'direction-1', title: 'Здоровье' },
          today: {
            mainDecision: null,
            decisionCount: 0,
            actionCount: 0,
            currentSession: null,
          },
          course: { activeDirectionCount: 1, activeProjectCount: 1 },
          signals: [],
        },
        onOpenSection: vi.fn(),
        onOpenProject: vi.fn(),
        onOpenDirection: vi.fn(),
        onOpenDecision: vi.fn(),
      }),
    );

    expect(markup).toContain('Нет сигналов, требующих внимания');
    expect(markup).toContain('role="status"');
  });

  it('встраивает существующий экран дня вместо дублирующей навигационной заглушки', () => {
    const markup = renderToStaticMarkup(
      createElement(
        ManagementDaySection,
        null,
        createElement('main', { className: 'today-page' }, 'Существующий План дня'),
      ),
    );

    expect(markup).toContain('aria-label="Управление · День"');
    expect(markup).toContain('class="today-page"');
    expect(markup).toContain('Существующий План дня');
    expect(markup).not.toContain('management-day-card');
  });

  it('показывает существующие статусы целей без расчёта прогресса', () => {
    expect(projectStatusLabel(PROJECT_STATUS.active)).toBe('Активный');
    expect(projectStatusLabel(PROJECT_STATUS.paused)).toBe('Приостановлен');
    expect(projectStatusLabel(PROJECT_STATUS.completed)).toBe('Завершён');
    expect(projectStatusLabel(PROJECT_STATUS.archived)).toBe('Архив');
  });

  it('выбирает главная цель раньше главного направления и сохраняет fallback', () => {
    const mainDirection = Direction.create({
      id: EntityId.create('direction-main'),
      name: 'Развитие LifeOS',
      isMain: true,
      now: NOW,
    });
    const mainProject = Project.create({
      id: EntityId.create('project-main'),
      title: 'Переработать Управление',
      isMain: true,
      now: NOW,
    });
    const directions = [
      {
        direction: mainDirection,
        activeProjectCount: 1,
        totalProjectCount: 1,
        isMain: true,
      },
    ];

    expect(selectManagementFocus(directions, [mainProject])).toMatchObject({
      kind: 'project',
      project: { title: 'Переработать Управление' },
    });
    expect(selectManagementFocus(directions, [])).toMatchObject({
      kind: 'direction',
      direction: { direction: { name: 'Развитие LifeOS' } },
    });
    expect(selectManagementFocus([], [])).toEqual({ kind: 'empty' });
  });
});
