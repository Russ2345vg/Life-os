// @ts-expect-error -- Node types are intentionally absent from the browser application project.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  RELAXATION_PRACTICE,
} from '../../domain';
import { buildEveningRelaxationModel } from './EveningRelaxationPresentation';
import {
  EveningBeforeRelaxationRatings,
  EveningRelaxationSceneState,
  EveningRelaxationSceneView,
} from './EveningRelaxationScene';

const sceneSource = readFileSync(new URL('./EveningRelaxationScene.tsx', import.meta.url), 'utf8');

describe('EveningRelaxationScene', () => {
  it('сохраняет геометрию loading и operation error с retry', () => {
    const loading = renderToStaticMarkup(
      createElement(EveningRelaxationSceneState, { status: 'loading' }),
    );
    const error = renderToStaticMarkup(
      createElement(EveningRelaxationSceneState, {
        status: 'error',
        message: 'Не удалось сохранить практику.',
        onRetry: vi.fn(),
      }),
    );

    expect(loading).toContain('data-relaxation-state="loading"');
    expect(loading).toContain('Переход к спокойствию');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Повторить');
  });

  it('даёт BEFORE stale-конфликту отдельное обновление сохранённых данных', () => {
    const markup = renderToStaticMarkup(
      createElement(EveningBeforeRelaxationRatings, {
        calm: 2,
        readiness: 3,
        busy: false,
        error: 'Данные вечера изменились.',
        stale: true,
        unavailable: false,
        onCalmChange: vi.fn(),
        onReadinessChange: vi.fn(),
        onSave: vi.fn(),
        onRetry: vi.fn(),
        onReload: vi.fn(),
      }),
    );

    expect(markup).toContain('Обновить данные');
  });

  it('показывает все независимые действия в рекомендуемом DOM-порядке', () => {
    const markup = activeMarkup();

    const status = markup.indexOf('data-relaxation-region="status"');
    const essentials = markup.indexOf('data-relaxation-region="essentials"');
    const screenFree = markup.indexOf('data-relaxation-region="screen-free"');
    const practice = markup.indexOf('data-relaxation-region="practice"');
    const continuation = markup.indexOf('data-relaxation-region="continuation"');
    expect(status).toBeGreaterThanOrEqual(0);
    expect(status).toBeLessThan(essentials);
    expect(essentials).toBeLessThan(screenFree);
    expect(screenFree).toBeLessThan(practice);
    expect(practice).toBeLessThan(continuation);
    expect(markup).toContain('Отметить напиток');
    expect(markup).toContain('Отметить гигиену');
    expect(markup).toContain('Начать без экранов');
    expect(markup).toContain('Начать таймер');
    expect(markup).toContain('Отметить выполненным');
  });

  it('даёт явный current-only/default выбор и ручную длительность 5–20', () => {
    const markup = activeMarkup();

    expect(markup).toContain('Только сегодня');
    expect(markup).toContain('Сделать практикой по умолчанию');
    for (const minutes of [5, 10, 15, 20]) {
      expect(markup).toContain(`>${minutes} мин<`);
    }
    expect(markup).toContain('aria-label="Длительность практики в минутах"');
    expect(markup).toContain('min="5"');
    expect(markup).toContain('max="20"');
    expect(markup).toContain('step="1"');
  });

  it('различает conscious skip от success и объясняет disabled CTA', () => {
    const cycle = initializedCycle();
    cycle.skipRelaxationScreenFree(at('21:01:00'));
    const markup = renderView(cycle);

    expect(markup).toContain('Пропущено сегодня');
    expect(markup).toContain('data-tone="skipped"');
    expect(markup).toContain('Завершите напиток');
    expect(markup).toContain('disabled=""');
  });

  it('read-only history не содержит mutation controls, а legacy объяснён', () => {
    const stored = renderView(initializedCycle(), true);
    const legacy = renderView(legacyCycle(), true);

    expect(stored).not.toContain('<button');
    expect(stored).toContain('Сохранённое расслабление');
    expect(legacy).toContain('Расслабление не записывалось для этого вечера');
    expect(legacy).not.toContain('<button');
  });

  it('сцена использует refresh-safe API, bounded interval и все отдельные команды', () => {
    for (const contract of [
      'getOrInitialize',
      'getStored',
      'choosePractice',
      'setPracticeDuration',
      'completeDrink',
      'completeHygiene',
      'startPracticeTimer',
      'completePractice',
      'startScreenFree',
      'shortenScreenFree',
      'skipScreenFree',
      'complete',
      'window.setInterval',
      'window.clearInterval',
    ]) {
      expect(sceneSource).toContain(contract);
    }
    expect(sceneSource).toContain('model?.hasActiveClock');
    expect(sceneSource).toContain('data-relaxation-focus');
  });
});

function activeMarkup(): string {
  return renderView(initializedCycle());
}

function renderView(cycle: EveningCycle, readOnly = false): string {
  return renderToStaticMarkup(
    createElement(EveningRelaxationSceneView, {
      model: buildEveningRelaxationModel(cycle, at('21:02:00'), readOnly),
      busyAction: null,
      error: null,
      durationDraft: String(cycle.relaxation?.practiceDurationMinutes ?? 15),
      onDurationDraftChange: vi.fn(),
      onAction: vi.fn(),
    }),
  );
}

function initializedCycle(): EveningCycle {
  const result = EveningCycle.rehydrate({
    id: EntityId.create('relaxation-scene-cycle'),
    dayId: EntityId.create('relaxation-scene-day'),
    dateKey: DayDate.create('2026-08-30'),
    state: EVENING_CYCLE_STATE.relaxing,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: at('20:00:00'),
    updatedAt: at('20:00:00'),
    completedAt: null,
    version: 1,
  });
  result.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, at('21:00:00'));
  return result;
}

function legacyCycle(): EveningCycle {
  return EveningCycle.rehydrate({
    id: EntityId.create('legacy-relaxation-scene-cycle'),
    dayId: EntityId.create('legacy-relaxation-scene-day'),
    dateKey: DayDate.create('2026-08-29'),
    state: EVENING_CYCLE_STATE.shutdown,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: at('20:00:00'),
    updatedAt: at('21:00:00'),
    completedAt: null,
    version: 1,
  });
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000Z`);
}
