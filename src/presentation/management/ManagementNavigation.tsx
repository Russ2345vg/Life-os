import { MANAGEMENT_SECTION, type ManagementSection } from './ManagementSection';

interface ManagementNavigationProps {
  readonly activeSection: ManagementSection;
  readonly onOpenSection: (section: ManagementSection) => void;
}

const ITEMS: readonly {
  readonly section: ManagementSection;
  readonly label: string;
  readonly group: 'Обзор' | 'Курс' | 'Исполнение' | 'День';
}[] = [
  { section: MANAGEMENT_SECTION.overview, label: 'Обзор', group: 'Обзор' },
  { section: MANAGEMENT_SECTION.directions, label: 'Направления', group: 'Курс' },
  { section: MANAGEMENT_SECTION.goals, label: 'Альбом целей', group: 'Курс' },
  { section: MANAGEMENT_SECTION.decisions, label: 'Решения', group: 'Исполнение' },
  { section: MANAGEMENT_SECTION.actions, label: 'Действия', group: 'Исполнение' },
  { section: MANAGEMENT_SECTION.day, label: 'День', group: 'День' },
];

export function ManagementNavigation({ activeSection, onOpenSection }: ManagementNavigationProps) {
  return (
    <nav className="management-navigation" aria-label="Разделы управления">
      <div className="management-navigation-list" role="tablist" aria-label="Управление">
        {ITEMS.map((item) => (
          <button
            className="management-navigation-tab"
            type="button"
            role="tab"
            key={item.section}
            aria-selected={item.section === activeSection}
            data-group={item.group}
            onClick={() => onOpenSection(item.section)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
