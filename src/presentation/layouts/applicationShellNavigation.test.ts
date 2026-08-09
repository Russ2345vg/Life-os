import { describe, expect, it, vi } from 'vitest';
import { APP_SECTION } from '../navigation/AppSection';
import { selectApplicationSection } from './applicationShellNavigation';

describe('selectApplicationSection', () => {
  it('переходит в выбранный раздел без дополнительных действий', () => {
    const onOpenSection = vi.fn();

    selectApplicationSection(APP_SECTION.history, onOpenSection);

    expect(onOpenSection).toHaveBeenCalledOnce();
    expect(onOpenSection).toHaveBeenCalledWith(APP_SECTION.history);
  });

  it('после выбора раздела закрывает мобильное меню', () => {
    const calls: string[] = [];

    selectApplicationSection(
      APP_SECTION.actions,
      (section) => calls.push(`open:${section}`),
      () => calls.push('close'),
    );

    expect(calls).toEqual(['open:actions', 'close']);
  });
});
