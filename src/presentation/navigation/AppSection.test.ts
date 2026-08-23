import { describe, expect, it } from 'vitest';
import { APP_SECTION, APP_SECTION_MENU_OPTIONS, resolveMenuEntrySection } from './AppSection';

describe('AppSection menu entries', () => {
  it('не показывает дубли Управления в меню и настройках', () => {
    expect(APP_SECTION_MENU_OPTIONS).toContain(APP_SECTION.management);
    expect(APP_SECTION_MENU_OPTIONS).toContain(APP_SECTION.eveningAnalytics);
    expect(APP_SECTION_MENU_OPTIONS).not.toContain(APP_SECTION.decisions);
    expect(APP_SECTION_MENU_OPTIONS).not.toContain(APP_SECTION.actions);
  });

  it('сохраняет старые настройки, открывая их через Управление', () => {
    expect(resolveMenuEntrySection(APP_SECTION.decisions)).toBe(APP_SECTION.management);
    expect(resolveMenuEntrySection(APP_SECTION.actions)).toBe(APP_SECTION.management);
    expect(resolveMenuEntrySection(APP_SECTION.today)).toBe(APP_SECTION.today);
  });
});
