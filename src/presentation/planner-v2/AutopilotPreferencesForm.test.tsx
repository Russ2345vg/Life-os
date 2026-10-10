import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AutopilotPreferencesForm } from './AutopilotPreferencesForm';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import type { AutopilotSetup } from '../../application/planner/DayAutopilotService';
it('shows default durations and requires sleep and day boundaries while preserving unresolved wish text', () => {
  const preferences = defaultAutopilotPreferences(),
    draft = { ...defaultAutopilotDayDraft('2026-10-10'), wishes: 'Порядок дома' };
  const setup: AutopilotSetup = {
    preferences: { schemaVersion: 1, version: 0, value: preferences },
    draft: { schemaVersion: 1, version: 0, value: draft },
    catalog: { actions: [], directions: [], goals: [], links: [] },
    wishResolution: { matches: [], unresolved: [{ text: 'Порядок дома', candidates: [] }] },
    suggestedEndMinute: null,
    sleepConfigured: false,
    timeZone: 'Asia/Chita',
  };
  const html = renderToStaticMarkup(
    createElement(AutopilotPreferencesForm, {
      setup,
      preferences,
      draft,
      busy: false,
      rebuild: false,
      onPreferences: vi.fn(),
      onDraft: vi.fn(),
      onRebuild: vi.fn(),
      onBuild: vi.fn(),
    }),
  );
  expect(html).toContain('Порядок дома');
  expect(html).toContain('Уточнить');
  expect(html).toContain('Подъём');
  expect(html).toContain('Отбой');
  expect(html).toContain('Закончить до');
  expect(html).toContain('value="30"');
  expect(html).toContain('value="45"');
  expect(html).toContain('value="5"');
  expect(html).toContain('Фокус сохраняется на этом устройстве');
});
