import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DAY_STATUS, type DayDate, type DayStatus } from '../../domain';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { formatSelectedDateTitle, formatSelectedDateWeekday } from '../date/selectedDate';
import { APP_SECTION, APP_SECTION_LABELS, type AppSection } from '../navigation/AppSection';
import type { InterfaceDensity } from '../settings/localSettings';
import { selectApplicationSection } from './applicationShellNavigation';

interface ApplicationShellViewProps {
  readonly globalActions?: ReactNode;
  readonly syncIndicator?: ReactNode;
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
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
}

interface NavigationItem {
  readonly section: AppSection;
  readonly icon: AppIconName;
}

const DESKTOP_NAVIGATION: readonly NavigationItem[] = [
  { section: APP_SECTION.today, icon: 'today' },
  { section: APP_SECTION.management, icon: 'management' },
  { section: APP_SECTION.routine, icon: 'routine' },
  { section: APP_SECTION.walks, icon: 'walks' },
  { section: APP_SECTION.spheres, icon: 'spheres' },
  { section: APP_SECTION.history, icon: 'history' },
  { section: APP_SECTION.eveningAnalytics, icon: 'statistics' },
  { section: APP_SECTION.more, icon: 'more' },
];

const MOBILE_NAVIGATION: readonly NavigationItem[] = [
  { section: APP_SECTION.today, icon: 'today' },
  { section: APP_SECTION.management, icon: 'management' },
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
  sidebarCollapsed,
  onToggleSidebar,
  syncIndicator,
  globalActions,
}: ApplicationShellViewProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButtonRef = useRef<HTMLButtonElement>(null);
  const currentSectionLabel = APP_SECTION_LABELS[activeSection];
  const selectedDateLabel = formatSelectedDateTitle(selectedDate, currentDate);
  const dayStatus = describeDayStatus(currentDayStatus);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileMenuCloseButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  function closeMobileMenu(): void {
    setMobileMenuOpen(false);
    mobileMenuButtonRef.current?.focus();
  }

  return (
    <>
      <div className="application-wordmark" aria-hidden="true">
        LifeOS
      </div>
      <div
        className={[
          'application-shell',
          `application-density-${interfaceDensity}`,
          sidebarCollapsed ? 'application-sidebar-collapsed' : '',
          reduceMotion ? 'application-reduce-motion' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <a className="skip-link" href="#application-content">
          Перейти к содержимому
        </a>

        <aside
          className="application-sidebar application-desktop-sidebar"
          aria-label="Навигация LifeOS"
        >
          <SidebarContent
            globalActions={globalActions}
            syncIndicator={syncIndicator}
            activeSection={activeSection}
            currentDayStatus={currentDayStatus}
            dayStatus={dayStatus}
            collapsed={sidebarCollapsed}
            onOpenSection={onOpenSection}
            onToggleSidebar={onToggleSidebar}
          />
        </aside>

        <div className="application-stage">
          <header className="application-mobile-header">
            <button
              ref={mobileMenuButtonRef}
              className="application-mobile-menu-button"
              type="button"
              aria-label="Открыть меню"
              aria-expanded={mobileMenuOpen}
              aria-controls="application-mobile-menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <AppIcon name="menu" />
            </button>
            <div className="application-mobile-heading">
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
            {globalActions ? (
              <div className="application-mobile-global-actions">{globalActions}</div>
            ) : null}
          </header>

          {syncIndicator ? <div className="application-sync-status">{syncIndicator}</div> : null}

          <div id="application-content" className="application-content" tabIndex={-1}>
            {children}
          </div>
        </div>

        {mobileMenuOpen ? (
          <ApplicationMobileMenu
            activeSection={activeSection}
            currentDayStatus={currentDayStatus}
            onOpenSection={onOpenSection}
            onClose={closeMobileMenu}
            closeButtonRef={mobileMenuCloseButtonRef}
          />
        ) : null}

        <nav className="application-bottom-navigation" aria-label="Мобильная навигация">
          <NavigationButton
            item={MOBILE_NAVIGATION[0]!}
            active={activeSection === APP_SECTION.today}
            onOpenSection={onOpenSection}
            mobile
          />
          <NavigationButton
            item={MOBILE_NAVIGATION[1]!}
            active={activeSection === APP_SECTION.management}
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
            active={
              activeSection === APP_SECTION.more || activeSection === APP_SECTION.eveningAnalytics
            }
            onOpenSection={onOpenSection}
            mobile
          />
        </nav>
      </div>
    </>
  );
}

interface ApplicationMobileMenuProps {
  readonly activeSection: AppSection;
  readonly currentDayStatus: DayStatus;
  readonly onOpenSection: (section: AppSection) => void;
  readonly onClose: () => void;
  readonly closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function ApplicationMobileMenu({
  activeSection,
  currentDayStatus,
  onOpenSection,
  onClose,
  closeButtonRef,
}: ApplicationMobileMenuProps) {
  const dayStatus = describeDayStatus(currentDayStatus);

  function openSection(section: AppSection): void {
    selectApplicationSection(section, onOpenSection, onClose);
  }

  return (
    <div className="application-mobile-menu-backdrop" onClick={onClose}>
      <aside
        id="application-mobile-menu"
        className="application-mobile-menu"
        aria-label="Мобильное меню LifeOS"
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <SidebarContent
          activeSection={activeSection}
          currentDayStatus={currentDayStatus}
          dayStatus={dayStatus}
          collapsed={false}
          onOpenSection={openSection}
          onCloseMobileMenu={onClose}
          mobileCloseButtonRef={closeButtonRef}
        />
      </aside>
    </div>
  );
}

interface SidebarContentProps {
  readonly globalActions?: ReactNode;
  readonly syncIndicator?: ReactNode;
  readonly activeSection: AppSection;
  readonly currentDayStatus: DayStatus;
  readonly dayStatus: DayStatusDescription;
  readonly collapsed: boolean;
  readonly onOpenSection: (section: AppSection) => void;
  readonly onToggleSidebar?: () => void;
  readonly onCloseMobileMenu?: () => void;
  readonly mobileCloseButtonRef?: React.RefObject<HTMLButtonElement | null> | undefined;
}

function SidebarContent({
  globalActions,
  syncIndicator,
  activeSection,
  currentDayStatus,
  dayStatus,
  collapsed,
  onOpenSection,
  onToggleSidebar,
  onCloseMobileMenu,
  mobileCloseButtonRef,
}: SidebarContentProps) {
  return (
    <>
      <div className="application-brand-block">
        <div className="application-brand-mark" aria-hidden="true">
          L
        </div>
        <div className="application-brand-copy">
          <p className="application-brand-name">LifeOS</p>
          <p className="application-brand-caption">Личная система действий</p>
        </div>
        {onToggleSidebar !== undefined ? (
          <button
            className="application-sidebar-toggle"
            type="button"
            aria-label={collapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню'}
            aria-pressed={collapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            onClick={onToggleSidebar}
          >
            <AppIcon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        ) : (
          <button
            ref={mobileCloseButtonRef}
            className="application-sidebar-toggle"
            type="button"
            aria-label="Закрыть меню"
            onClick={onCloseMobileMenu}
          >
            <AppIcon name="close" />
          </button>
        )}
      </div>

      <nav className="application-navigation" aria-label="Основные разделы">
        {DESKTOP_NAVIGATION.map((item) => (
          <NavigationButton
            key={item.section}
            item={item}
            active={item.section === activeSection}
            collapsed={collapsed}
            onOpenSection={onOpenSection}
          />
        ))}
        <a
          className="application-navigation-link"
          href="#/v2/today"
          aria-label="V2 Планировщик"
          data-tooltip={collapsed ? 'V2 Планировщик' : undefined}
          title={collapsed ? 'V2 Планировщик' : undefined}
          onClick={onCloseMobileMenu}
        >
          <AppIcon name="today" />
          <span className="application-navigation-label">V2 Планировщик</span>
        </a>
      </nav>

      {globalActions ? <div className="application-global-actions">{globalActions}</div> : null}
      <div
        className={`application-day-status application-day-status-${currentDayStatus}`}
        aria-label={`${dayStatus.title}. ${dayStatus.description}`}
        title={collapsed ? dayStatus.title : undefined}
      >
        <span className="application-day-status-dot" aria-hidden="true" />
        <div className="application-status-copy">
          <strong>{dayStatus.title}</strong>
          <span>{dayStatus.description}</span>
        </div>
      </div>

      {syncIndicator ? (
        <div className="application-sidebar-sync">{syncIndicator}</div>
      ) : (
        <div
          className="application-sidebar-status"
          aria-label="Локальный режим. Данные хранятся на устройстве"
          title={collapsed ? 'Локальный режим' : undefined}
        >
          <span className="application-status-dot" aria-hidden="true" />
          <div className="application-status-copy">
            <strong>Локальный режим</strong>
            <span>Данные хранятся на устройстве</span>
          </div>
        </div>
      )}
    </>
  );
}

interface NavigationButtonProps {
  readonly item: NavigationItem;
  readonly active: boolean;
  readonly onOpenSection: (section: AppSection) => void;
  readonly mobile?: boolean;
  readonly collapsed?: boolean;
}

function NavigationButton({
  item,
  active,
  onOpenSection,
  mobile = false,
  collapsed = false,
}: NavigationButtonProps) {
  const label = APP_SECTION_LABELS[item.section];

  return (
    <button
      className={mobile ? 'application-bottom-link' : 'application-navigation-link'}
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-tooltip={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={() => selectApplicationSection(item.section, onOpenSection)}
    >
      <AppIcon name={item.icon} />
      <span className="application-navigation-label">{label}</span>
    </button>
  );
}

interface DayStatusDescription {
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
}

function describeDayStatus(status: DayStatus): DayStatusDescription {
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
