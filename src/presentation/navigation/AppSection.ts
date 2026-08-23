export const APP_SECTION = {
  today: 'today',
  management: 'management',
  decisions: 'decisions',
  actions: 'actions',
  routine: 'routine',
  walks: 'walks',
  spheres: 'spheres',
  history: 'history',
  eveningAnalytics: 'evening-analytics',
  more: 'more',
} as const;

export type AppSection = (typeof APP_SECTION)[keyof typeof APP_SECTION];

export const APP_SECTION_MENU_OPTIONS: readonly AppSection[] = [
  APP_SECTION.today,
  APP_SECTION.management,
  APP_SECTION.routine,
  APP_SECTION.walks,
  APP_SECTION.spheres,
  APP_SECTION.history,
  APP_SECTION.eveningAnalytics,
  APP_SECTION.more,
];

export function resolveMenuEntrySection(section: AppSection): AppSection {
  return section === APP_SECTION.decisions || section === APP_SECTION.actions
    ? APP_SECTION.management
    : section;
}

export const APP_SECTION_LABELS: Readonly<Record<AppSection, string>> = {
  [APP_SECTION.management]: 'Управление',
  [APP_SECTION.routine]: 'Распорядок',
  [APP_SECTION.walks]: 'Прогулки',
  [APP_SECTION.spheres]: 'Сферы',
  [APP_SECTION.today]: 'День',
  [APP_SECTION.decisions]: 'Решения',
  [APP_SECTION.actions]: 'Действия',
  [APP_SECTION.history]: 'История',
  [APP_SECTION.eveningAnalytics]: 'Вечерняя аналитика',
  [APP_SECTION.more]: 'Ещё',
};
