import type { AppSection } from '../navigation/AppSection';

export function selectApplicationSection(
  section: AppSection,
  onOpenSection: (section: AppSection) => void,
  afterSelection?: () => void,
): void {
  onOpenSection(section);
  afterSelection?.();
}
