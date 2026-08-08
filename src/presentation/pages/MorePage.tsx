import { useState } from 'react';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { APP_SECTION, APP_SECTION_LABELS, type AppSection } from '../navigation/AppSection';
import {
  copyLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  INTERFACE_DENSITY,
  type LocalSettings,
} from '../settings/localSettings';

interface MorePageProps {
  readonly settings: LocalSettings;
  readonly settingsStorageAvailable: boolean;
  readonly settingsRecoveredFromInvalidValue: boolean;
  readonly onOpenSection: (section: AppSection) => void;
  readonly onSaveSettings: (settings: LocalSettings) => boolean;
  readonly onResetSettings: () => boolean;
}

interface MoreSectionItem {
  readonly title: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly available: boolean;
  readonly target?: AppSection;
  readonly opensSettings?: boolean;
}

const MORE_SECTIONS: readonly MoreSectionItem[] = [
  {
    title: 'Решения',
    description: 'Обзор главных и дополнительных решений по выбранной дате.',
    icon: 'decisions',
    available: true,
    target: APP_SECTION.decisions,
  },
  {
    title: 'Настройки',
    description: 'Стартовый раздел, плотность интерфейса и параметры мобильной шапки.',
    icon: 'settings',
    available: true,
    opensSettings: true,
  },
  {
    title: 'Распорядок',
    description: 'Блоки дня, обязательные точки и ближайшие события.',
    icon: 'routine',
    available: true,
    target: APP_SECTION.routine,
  },
  {
    title: 'Прогулки',
    description: 'Сессии прогулок, заметки и наблюдения.',
    icon: 'walks',
    available: false,
  },
  {
    title: 'Статистика',
    description: 'Спокойный обзор результатов и фактически вложенного времени.',
    icon: 'statistics',
    available: false,
  },
  {
    title: 'Сферы',
    description: 'Связь решений с направлениями и сферами жизни.',
    icon: 'spheres',
    available: false,
  },
];

export function MorePage(props: MorePageProps) {
  const [view, setView] = useState<'index' | 'settings'>('index');

  if (view === 'settings') {
    return <LocalSettingsPage {...props} onBack={() => setView('index')} />;
  }

  return (
    <main className="section-page more-page">
      <SectionPageHeader
        eyebrow="Структура LifeOS"
        title="Ещё"
        description="Дополнительные разделы подключаются поэтапно, не нарушая уже работающий цикл."
      />

      <section className="more-section-grid" aria-label="Дополнительные разделы">
        {MORE_SECTIONS.map((item) => {
          if (item.available) {
            return (
              <button
                className="more-section-card available"
                type="button"
                key={item.title}
                onClick={() => {
                  if (item.target !== undefined) {
                    props.onOpenSection(item.target);
                  } else if (item.opensSettings === true) {
                    setView('settings');
                  }
                }}
              >
                <MoreSectionContent item={item} />
              </button>
            );
          }

          return (
            <article className="more-section-card" key={item.title} aria-disabled="true">
              <MoreSectionContent item={item} />
            </article>
          );
        })}
      </section>

      <section className="local-mode-card">
        <div>
          <p className="section-page-eyebrow">Хранилище</p>
          <h2>Локальный режим активен</h2>
          <p>
            Решения, действия и рабочие сессии сохраняются в IndexedDB этого браузера. Облачная
            синхронизация не используется.
          </p>
        </div>
        <span className="local-mode-indicator">Подключено</span>
      </section>
    </main>
  );
}

export interface LocalSettingsPageProps extends MorePageProps {
  readonly onBack: () => void;
}

export function LocalSettingsPage({
  settings,
  settingsStorageAvailable,
  settingsRecoveredFromInvalidValue,
  onSaveSettings,
  onResetSettings,
  onBack,
}: LocalSettingsPageProps) {
  const [draft, setDraft] = useState<LocalSettings>(() => copyLocalSettings(settings));
  const [message, setMessage] = useState<string | null>(
    settingsRecoveredFromInvalidValue
      ? 'Повреждённые настройки были заменены безопасными значениями.'
      : null,
  );
  const [messageKind, setMessageKind] = useState<'success' | 'error' | 'notice'>(
    settingsRecoveredFromInvalidValue ? 'notice' : 'success',
  );

  function save(): void {
    if (!onSaveSettings(draft)) {
      setMessageKind('error');
      setMessage('Не удалось сохранить настройки в этом браузере.');
      return;
    }

    setMessageKind('success');
    setMessage('Настройки сохранены на этом устройстве.');
  }

  function reset(): void {
    if (!onResetSettings()) {
      setMessageKind('error');
      setMessage('Не удалось сбросить настройки в этом браузере.');
      return;
    }

    setDraft(copyLocalSettings(DEFAULT_LOCAL_SETTINGS));
    setMessageKind('success');
    setMessage('Настройки возвращены к исходным значениям.');
  }

  return (
    <main className="section-page more-page settings-page">
      <SectionPageHeader
        eyebrow="Локальные параметры"
        title="Настройки"
        description="Эти параметры меняют только отображение и стартовый экран. Решения, действия и история не затрагиваются."
        action={
          <button className="secondary-button" type="button" onClick={onBack}>
            Назад к разделам
          </button>
        }
      />

      {!settingsStorageAvailable ? (
        <p className="settings-storage-warning" role="status">
          Браузер ограничил локальное хранилище настроек. Изменения могут не сохраниться после F5.
        </p>
      ) : null}

      <section className="settings-panel" aria-labelledby="interface-settings-heading">
        <div className="settings-panel-heading">
          <div>
            <p className="section-page-eyebrow">Интерфейс</p>
            <h2 id="interface-settings-heading">Рабочая среда</h2>
          </div>
          <span>Применяется после сохранения</span>
        </div>

        <div className="settings-form">
          <label className="settings-field" htmlFor="settings-default-section">
            <span>Стартовый раздел</span>
            <select
              id="settings-default-section"
              value={draft.defaultSection}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultSection: event.target.value as AppSection,
                }))
              }
            >
              {Object.values(APP_SECTION).map((section) => (
                <option key={section} value={section}>
                  {APP_SECTION_LABELS[section]}
                </option>
              ))}
            </select>
            <small>Откроется при следующем запуске или обновлении страницы.</small>
          </label>

          <fieldset className="settings-fieldset">
            <legend>Плотность интерфейса</legend>
            <div className="settings-choice-row">
              <label className="settings-choice">
                <input
                  type="radio"
                  name="interface-density"
                  value={INTERFACE_DENSITY.comfortable}
                  checked={draft.interfaceDensity === INTERFACE_DENSITY.comfortable}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      interfaceDensity: INTERFACE_DENSITY.comfortable,
                    }))
                  }
                />
                <span>
                  <strong>Обычная</strong>
                  <small>Больше воздуха между карточками.</small>
                </span>
              </label>
              <label className="settings-choice">
                <input
                  type="radio"
                  name="interface-density"
                  value={INTERFACE_DENSITY.compact}
                  checked={draft.interfaceDensity === INTERFACE_DENSITY.compact}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      interfaceDensity: INTERFACE_DENSITY.compact,
                    }))
                  }
                />
                <span>
                  <strong>Компактная</strong>
                  <small>Больше информации помещается на экране.</small>
                </span>
              </label>
            </div>
          </fieldset>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.reduceMotion}
              onChange={(event) =>
                setDraft((current) => ({ ...current, reduceMotion: event.target.checked }))
              }
            />
            <span>
              <strong>Уменьшить движение</strong>
              <small>Отключает декоративные переходы и плавные эффекты.</small>
            </span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.showMobileWeekday}
              onChange={(event) =>
                setDraft((current) => ({ ...current, showMobileWeekday: event.target.checked }))
              }
            />
            <span>
              <strong>Показывать день недели на телефоне</strong>
              <small>Отображается под датой в компактной верхней панели.</small>
            </span>
          </label>
        </div>

        {message !== null ? (
          <p className={`settings-message ${messageKind}`} role="status">
            {message}
          </p>
        ) : null}

        <div className="settings-actions">
          <button className="primary-button" type="button" onClick={save}>
            Сохранить настройки
          </button>
          <button className="secondary-button" type="button" onClick={reset}>
            Сбросить настройки
          </button>
        </div>
      </section>

      <section className="settings-data-card">
        <div>
          <p className="section-page-eyebrow">Данные</p>
          <h2>Предметные записи не изменяются</h2>
          <p>
            Сброс настроек не удаляет решения, действия, рабочие сессии или историю. Импорт, экспорт
            и полная очистка данных будут отдельным безопасным этапом.
          </p>
        </div>
        <span className="local-mode-indicator">Защищены</span>
      </section>
    </main>
  );
}

interface MoreSectionContentProps {
  readonly item: MoreSectionItem;
}

function MoreSectionContent({ item }: MoreSectionContentProps) {
  return (
    <>
      <span className="more-section-icon">
        <AppIcon name={item.icon} />
      </span>
      <span className="more-section-copy">
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </span>
      <span className={item.available ? 'more-section-state available' : 'more-section-state'}>
        {item.available ? 'Открыть' : 'Следующий этап'}
      </span>
    </>
  );
}
