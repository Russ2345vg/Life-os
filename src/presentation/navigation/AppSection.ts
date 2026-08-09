export const APP_SECTION = {
  today: 'today',
  decisions: 'decisions',
  actions: 'actions',
  routine: 'routine',
  walks: 'walks',
  spheres: 'spheres',
  history: 'history',
  more: 'more',
} as const;

export type AppSection = (typeof APP_SECTION)[keyof typeof APP_SECTION];

export const APP_SECTION_LABELS: Readonly<Record<AppSection, string>> = {
  [APP_SECTION.routine]: 'Распорядок',
  [APP_SECTION.walks]: 'Прогулки',
  [APP_SECTION.spheres]: 'Сферы',
  [APP_SECTION.today]: 'День',
  [APP_SECTION.decisions]: 'Решения',
  [APP_SECTION.actions]: 'Действия',
  [APP_SECTION.history]: 'История',
  [APP_SECTION.more]: 'Ещё',
};
