import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';
import { DayDate, Direction, EntityId, Project } from '../../domain';
import { DirectionCard, DirectionProjectCreateForm, DirectionSignals } from './DirectionsSection';

const NOW = new Date('2026-08-10T08:00:00.000Z');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const directionSource = readFileSync(new URL('./DirectionsSection.tsx', import.meta.url), 'utf8');

describe('D6 Direction experience', () => {
  it('shows the description while keeping goals and activity inside the direction', () => {
    const direction = Direction.create({
      id: EntityId.create('direction-d5'),
      name: 'Развитие LifeOS',
      description: 'Длинное описание не должно конкурировать со стратегическими фактами.',
      isMain: true,
      now: NOW,
    });
    const mainProject = Project.create({
      id: EntityId.create('project-d5'),
      directionId: direction.id,
      title: 'D5 Direction Experience',
      isMain: true,
      now: NOW,
    });
    const markup = renderToStaticMarkup(
      createElement(DirectionCard, {
        item: { direction, activeProjectCount: 2, totalProjectCount: 3, isMain: true },
        detail: {
          direction,
          mainProject,
          activeProjects: [],
          pausedProjects: [],
          completedProjects: [],
          archivedProjects: [],
          projects: [mainProject],
          operationalState: 'no_execution',
          counts: { active: 2, paused: 0, completed: 0 },
          lastStrategicReviewAt: null,
          pulse: {
            operationalState: 'no_execution',
            activeProjectCount: 2,
            pausedProjectCount: 0,
            completedProjectCount: 0,
            activeDecisionCount: 0,
            unfinishedActionCount: 0,
            completedActionCount: 0,
            completedSessionCount: 0,
            totalActualTimeMs: 0,
            lastRealMovementAt: NOW,
            dynamics: {
              periodDays: 7,
              startDate: DayDate.create('2026-08-04'),
              endDate: DayDate.create('2026-08-10'),
              completedActionCount: 0,
              completedSessionCount: 0,
              actualTimeMs: 0,
            },
          },
        },
        spheres: { active: [], archived: [] },
        busy: false,
        onOpen: vi.fn(),
        onEdit: vi.fn(),
        onMakeMain: vi.fn(),
        onArchive: vi.fn(),
        onRestore: undefined,
      }),
    );

    for (const value of [
      'D5 Direction Experience',
      'Нет движения',
      '3 цели',
      'Требует внимания',
      'Активность',
      '30 дней',
    ])
      expect(markup).not.toContain(value);
    expect(markup).toContain(direction.name);
    expect(markup).toContain(direction.description);
    expect(markup).toContain('Без сферы');
    expect(markup).toContain('role="link"');
  });

  it('hides signals when the operational state only repeats the page state', () => {
    const clear = renderToStaticMarkup(
      createElement(DirectionSignals, { operationalState: 'moving' }),
    );
    const problem = renderToStaticMarkup(
      createElement(DirectionSignals, { operationalState: 'no_active_project' }),
    );

    expect(clear).toBe('');
    expect(problem).toBe('');
  });

  it('keeps long content constrained and collapses the layout on mobile', () => {
    expect(globalCss).toMatch(/\.direction-card-heading strong\s*{[^}]*overflow-wrap:\s*anywhere/);
    expect(globalCss).toMatch(
      /\.directions-section \.direction-card-description\s*{[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(globalCss).not.toMatch(
      /\.directions-section \.direction-card-description\s*{[^}]*(?:text-overflow|-webkit-line-clamp):/,
    );
    expect(globalCss).toMatch(/\.direction-focus h2,[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(globalCss).toMatch(
      /@media \(max-width:\s*30rem\)[\s\S]*?\.direction-focus,[\s\S]*?flex-direction:\s*column/,
    );
    expect(globalCss).toMatch(/\.direction-card\s*{[^}]*transition:/);
  });

  it('gives the compact strategic review a comfortable internal rhythm', () => {
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-review-entry\s*{[^}]*gap:\s*1\.5rem;[^}]*padding:\s*1\.375rem 1\.625rem;/,
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-review-entry > div\s*{[^}]*display:\s*grid;[^}]*gap:\s*0\.35rem;/,
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-review-entry \.direction-text-action\s*{[^}]*align-self:\s*center;[^}]*margin-left:\s*auto;/,
    );
  });

  it('keeps the details sections in the D6 strategic order', () => {
    const detailStart = directionSource.indexOf('function DirectionDetail');
    const pulseComponentStart = directionSource.indexOf('export function DirectionPulsePanel');
    const detailSource = directionSource.slice(detailStart, pulseComponentStart);
    const orderedMarkers = [
      'aria-labelledby="direction-focus-heading"',
      'className="direction-projects"',
      '<DirectionPulsePanel',
      '<DirectionStrategicOutline',
      'className="direction-review-entry"',
      '<DirectionSignals',
    ];
    const positions = orderedMarkers.map((marker) => detailSource.indexOf(marker));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('uses a desktop register and keeps mobile one-column', () => {
    expect(globalCss).toMatch(
      /\.directions-section \.direction-card-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(globalCss).toMatch(/\.directions-section \.direction-card-open\s*{[^}]*display:\s*grid/);
    expect(globalCss).toMatch(
      /@media \(max-width:\s*48rem\)[\s\S]*?\.directions-section \.direction-card-open\s*{[^}]*display:\s*flex/,
    );
  });

  it('uses compact project actions when the portfolio is empty', () => {
    const detailStart = directionSource.indexOf('function DirectionDetail');
    const pulseComponentStart = directionSource.indexOf('export function DirectionPulsePanel');
    const detailSource = directionSource.slice(detailStart, pulseComponentStart);

    expect(detailSource).toContain('Создать цель');
    expect(detailSource).toContain('Выбрать из портфеля');
    expect(detailSource).toContain('+ Создать первый цель');
    expect(detailSource).not.toContain('+ Новая цель');
    expect(detailSource).toContain('Целей пока нет.');
    expect(detailSource).not.toContain('Портфель пока пуст.');
  });

  it('renders readable two-level project summaries and full-width portfolio rows', () => {
    const detailStart = directionSource.indexOf('function DirectionDetail');
    const detailSource = directionSource.slice(detailStart);
    const focusStart = detailSource.indexOf('className="direction-focus-project"');
    const focusEnd = detailSource.indexOf('<section className="direction-projects"');
    const focusSource = detailSource.slice(focusStart, focusEnd);
    const groupStart = detailSource.indexOf('function DirectionProjectGroup');
    const groupEnd = detailSource.indexOf('interface DirectionFormProps');
    const groupSource = detailSource.slice(groupStart, groupEnd);

    for (const value of [
      'Портфель · {projects.length}',
      'Открыть цель →',
      'direction-focus-project-top',
      'direction-focus-project-bottom',
      'direction-focus-project-result',
      'direction-project-row',
      'direction-project-row-top',
      'direction-project-row-result',
      'direction-project-main-marker',
      'aria-label="Главная цель"',
      '★',
      'Открыть →',
    ])
      expect(detailSource).toContain(value);
    expect(focusSource).not.toContain('<small>Желаемый результат</small>');
    expect(groupSource).not.toContain('<small>Желаемый результат</small>');
    expect(detailSource).not.toContain(
      '{counts.active} активных · {counts.paused} приостановленных',
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-focus-has-project\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*background:\s*var\(--surface-glass-raised\)/,
    );
    expect(globalCss).toMatch(
      /\.direction-focus-project-bottom\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-project-grid\s*{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(globalCss).toMatch(
      /\.direction-project-row\s*{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*background:\s*var\(--surface-glass\)/,
    );
    expect(globalCss).toMatch(
      /\.direction-project-row-result\s*{[^}]*max-width:\s*72ch;[^}]*-webkit-line-clamp:\s*2;/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width:\s*30rem\)[\s\S]*?\.direction-focus-project-bottom,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.direction-project-row-action\s*{[^}]*justify-self:\s*end;/,
    );
  });

  it('omits empty portfolio categories, keeps a populated archive separate and hides dash placeholders', () => {
    const detailStart = directionSource.indexOf('function DirectionDetail');
    const pulseComponentStart = directionSource.indexOf('export function DirectionPulsePanel');
    const detailSource = directionSource.slice(detailStart, pulseComponentStart);

    expect(detailSource).toContain('pausedProjects.length === 0 ? null');
    expect(detailSource).toContain('completedProjects.length === 0 ? null');
    expect(detailSource).toContain('archivedProjects.length === 0 ? null');
    expect(detailSource).toContain('title="Архив"');
    expect(detailSource).toContain("directionDescription === '-'");
  });

  it('renders the project form in the requested order with inherited context', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionProjectCreateForm, {
        directionName: 'Финансовая безопасность',
        sphereName: 'Деньги',
        draft: { title: '', desiredResult: '', makeMain: false },
        saving: false,
        onDraftChange: vi.fn(),
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    const orderedLabels = [
      'Новая цель',
      'Название',
      'Сделать главной целью',
      'Желаемый результат',
      'Направление: Финансовая безопасность · Сфера: Деньги',
      'Отмена',
      'Создать цель',
    ];
    const positions = orderedLabels.map((label) => markup.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).toContain('placeholder="Например: Финансовая подушка"');
    expect(markup).toContain('class="direction-project-main-option"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('class="direction-project-checkbox"');
    expect(markup).toContain('rows="2"');
    expect(markup).not.toContain('Сразу назначить главным');
  });

  it('shows a clear disabled loading state for project creation', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionProjectCreateForm, {
        directionName: 'LifeOS',
        sphereName: null,
        draft: { title: 'Новая цель', desiredResult: '', makeMain: true },
        saving: true,
        onDraftChange: vi.fn(),
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Направление: LifeOS · Сфера: Без сферы');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('Создание…');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });

  it('keeps the project create form compact, gold-accented and responsive', () => {
    expect(globalCss).toMatch(
      /\.direction-project-form\s*{[^}]*display:\s*grid;[^}]*max-width:\s*44rem;[^}]*gap:\s*1rem;[^}]*padding:\s*1\.25rem;/,
    );
    expect(globalCss).toMatch(/\.direction-project-field input\s*{[^}]*height:\s*2\.625rem;/);
    expect(globalCss).toMatch(/\.direction-project-field textarea\s*{[^}]*min-height:\s*4\.5rem;/);
    expect(globalCss).toMatch(
      /\.direction-project-checkbox\s*{[^}]*width:\s*1\.125rem;[^}]*height:\s*1\.125rem;/,
    );
    expect(globalCss).toMatch(
      /input:checked \+ \.direction-project-checkbox\s*{[^}]*border-color:\s*var\(--border-accent\);[^}]*background:\s*var\(--gold-main\);/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width:\s*30rem\)[\s\S]*?\.direction-project-form\s*{[^}]*max-width:\s*100%;[^}]*padding:\s*1rem;/,
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-project-form\s*{[^}]*max-width:\s*44rem;[^}]*padding:\s*1\.25rem;/,
    );
    expect(globalCss).toMatch(
      /\.direction-detail \.direction-project-form-actions\s*{[^}]*position:\s*static;[^}]*background:\s*transparent;/,
    );
    expect(globalCss).toContain('@keyframes direction-project-form-enter');
  });
});
