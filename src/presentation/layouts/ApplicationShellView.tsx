import type { ReactNode } from 'react';
import { DAY_STATUS, type DayDate, type DayStatus } from '../../domain';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { APP_SECTION, APP_SECTION_LABELS, type AppSection } from '../navigation/AppSection';
import { formatSelectedDateTitle, formatSelectedDateWeekday } from '../date/selectedDate';
import type { InterfaceDensity } from '../settings/localSettings';

interface ApplicationShellViewProps {
  readonly activeSection: AppSection;
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly currentDayStatus: DayStatus;
  readonly children: ReactNode;
  readonly onOpenSection: (section: AppSection) => void;
  readonly onCreate: () => void;
  readonly interfaceDensity: InterfaceDensity;
  readonly reduceMotion: boolean;
  readonly showMobileWeekday: boolean;
}

interface NavigationItem {
  readonly section: AppSection;
  readonly icon: AppIconName;
  readonly desktopOnly?: boolean;
}

const DESKTOP_NAVIGATION: readonly NavigationItem[] = [
  { section: APP_SECTION.today, icon: 'today' },
  { section: APP_SECTION.decisions, icon: 'decisions' },
  { section: APP_SECTION.actions, icon: 'actions' },
  { section: APP_SECTION.routine, icon: 'routine' },
  { section: APP_SECTION.spheres, icon: 'spheres' },
  { section: APP_SECTION.history, icon: 'history' },
  { section: APP_SECTION.more, icon: 'more' },
];

const MOBILE_NAVIGATION: readonly NavigationItem[] = [
  { section: APP_SECTION.today, icon: 'today' },
  { section: APP_SECTION.actions, icon: 'actions' },
  { section: APP_SECTION.history, icon: 'history' },
  { section: APP_SECTION.more, icon: 'more' },
];

export function ApplicationShellView({
  activeSection,
  currentDate,
  selectedDate,
  currentDayStatus,
  children,
  onOpenSection,
  onCreate,
  interfaceDensity,
  reduceMotion,
  showMobileWeekday,
}: ApplicationShellViewProps) {
  const currentSectionLabel = APP_SECTION_LABELS[activeSection];
  const selectedDateLabel = formatSelectedDateTitle(selectedDate, currentDate);
  const dayStatus = describeDayStatus(currentDayStatus);

  return (
    <div
      className={[
        'application-shell',
        `application-density-${interfaceDensity}`,
        reduceMotion ? 'application-reduce-motion' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <a className="skip-link" href="#application-content">
        Перейти к содержимому
      </a>

      <aside className="application-sidebar" aria-label="Навигация LifeOS">
        <div className="application-brand-block">
          <div className="application-brand-mark" aria-hidden="true">
            L
          </div>
          <div>
            <p className="application-brand-name">LifeOS</p>
            <p className="application-brand-caption">Личная система действий</p>
          </div>
        </div>

        <nav className="application-navigation" aria-label="Основные разделы">
          {DESKTOP_NAVIGATION.map((item) => (
            <NavigationButton
              key={item.section}
              item={item}
              active={item.section === activeSection}
              onOpenSection={onOpenSection}
            />
          ))}
        </nav>

        <div className={`application-day-status application-day-status-${currentDayStatus}`}>
          <span className="application-day-status-dot" aria-hidden="true" />
          <div>
            <strong>{dayStatus.title}</strong>
            <span>{dayStatus.description}</span>
          </div>
        </div>

        <div className="application-sidebar-status">
          <span className="application-status-dot" aria-hidden="true" />
          <div>
            <strong>Локальный режим</strong>
            <span>Данные хранятся на устройстве</span>
          </div>
        </div>
      </aside>

      <div className="application-stage">
        <header className="application-mobile-header">
          <div>
            <p className="application-mobile-brand">LifeOS</p>
            <p className="application-mobile-section" aria-live="polite">
              {currentSectionLabel}
            </p>
          </div>
          <div className="application-mobile-date">
            <span
              className={`application-mobile-day-status application-mobile-day-status-${currentDayStatus}`}
            >
              {dayStatus.shortTitle}
            </span>
            <strong>{selectedDateLabel}</strong>
            {showMobileWeekday ? <span>{formatSelectedDateWeekday(selectedDate)}</span> : null}
          </div>
        </header>

        <div id="application-content" className="application-content" tabIndex={-1}>
          {children}
        </div>
      </div>

      <nav className="application-bottom-navigation" aria-label="Мобильная навигация">
        <NavigationButton
          item={MOBILE_NAVIGATION[0]!}
          active={activeSection === APP_SECTION.today}
          onOpenSection={onOpenSection}
          mobile
        />
        <NavigationButton
          item={MOBILE_NAVIGATION[1]!}
          active={activeSection === APP_SECTION.actions}
          onOpenSection={onOpenSection}
          mobile
        />
        <button
          className="application-create-navigation"
          type="button"
          aria-label="Создать решение"
          onClick={onCreate}
        >
          <span className="application-create-icon">
            <AppIcon name="create" />
          </span>
          <span>Создать</span>
        </button>
        <NavigationButton
          item={MOBILE_NAVIGATION[2]!}
          active={activeSection === APP_SECTION.history}
          onOpenSection={onOpenSection}
          mobile
        />
        <NavigationButton
          item={MOBILE_NAVIGATION[3]!}
          active={activeSection === APP_SECTION.more}
          onOpenSection={onOpenSection}
          mobile
        />
      </nav>
    </div>
  );
}

interface NavigationButtonProps {
  readonly item: NavigationItem;
  readonly active: boolean;
  readonly onOpenSection: (section: AppSection) => void;
  readonly mobile?: boolean;
}

function NavigationButton({ item, active, onOpenSection, mobile = false }: NavigationButtonProps) {
  return (
    <button
      className={mobile ? 'application-bottom-link' : 'application-navigation-link'}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onOpenSection(item.section)}
    >
      <AppIcon name={item.icon} />
      <span>{APP_SECTION_LABELS[item.section]}</span>
    </button>
  );
}

function describeDayStatus(status: DayStatus): {
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
} {
  switch (status) {
    case DAY_STATUS.planned:
      return {
        title: 'День не начат',
        shortTitle: 'Не начат',
        description: 'Проверьте главные решения',
      };
    case DAY_STATUS.open:
      return {
        title: 'День идёт',
        shortTitle: 'День идёт',
        description: 'Рабочий цикл активен',
      };
    case DAY_STATUS.completed:
      return {
        title: 'День завершён',
        shortTitle: 'Завершён',
        description: 'Итоги сохранены',
      };
  }
}
