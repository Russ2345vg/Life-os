import { MORNING_CENTER_STAGE_ID, type MorningCenterStageId } from '../../application';

export const MORNING_STAGE_PRESENTATION: Record<
  MorningCenterStageId,
  { readonly icon: string; readonly title: string; readonly description: string }
> = {
  [MORNING_CENTER_STAGE_ID.quickStart]: {
    icon: '⚡︎',
    title: 'Быстрый старт',
    description: 'Вода и холодный душ',
  },
  [MORNING_CENTER_STAGE_ID.physicalActivation]: {
    icon: '◉',
    title: 'Физическая активация',
    description: 'Подготовка к физической активности',
  },
  [MORNING_CENTER_STAGE_ID.mirror]: {
    icon: '◐',
    title: 'Настрой перед зеркалом',
    description: 'Короткая настройка внимания',
  },
  [MORNING_CENTER_STAGE_ID.mainAction]: {
    icon: '◆',
    title: 'Главное действие',
    description: 'Подготовка главного фокуса дня',
  },
  [MORNING_CENTER_STAGE_ID.workBlock]: {
    icon: '▣',
    title: 'Рабочий блок',
    description: 'Переход к работе',
  },
};
