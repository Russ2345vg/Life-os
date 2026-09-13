import { useState } from 'react';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { SectionPageHeader } from '../components/SectionPageHeader';
import {
  APP_SECTION,
  APP_SECTION_LABELS,
  APP_SECTION_MENU_OPTIONS,
  resolveMenuEntrySection,
  type AppSection,
} from '../navigation/AppSection';
import {
  copyLocalSettings,
  DEFAULT_LOCAL_SETTINGS,
  INTERFACE_DENSITY,
  type LocalSettings,
} from '../settings/localSettings';
import {
  EVENING_RITUAL_ITEM_CATALOG,
  isEveningRitualSettings,
  type EveningRitualSettings,
} from '../../application/evening-settings';
import { RELAXATION_PRACTICE, type RelaxationPractice } from '../../domain';
import type { SystemUpdateRuntime } from '../../application/updates/SystemUpdate';
import { SystemUpdatePanel } from '../settings/SystemUpdatePanel';
import type { SyncApplication } from '../../application/sync/SyncApplicationService';
import { SyncPage } from '../sync/SyncPage';

interface MorePageProps {
  readonly syncOpenRequest?: number;
  readonly settings: LocalSettings;
  readonly settingsStorageAvailable: boolean;
  readonly settingsRecoveredFromInvalidValue: boolean;
  readonly onOpenSection: (section: AppSection) => void;
  readonly onSaveSettings: (settings: LocalSettings) => boolean;
  readonly onResetSettings: () => boolean;
  readonly systemUpdate: SystemUpdateRuntime;
  readonly sync: SyncApplication;
}

interface MoreSectionItem {
  readonly title: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly available: boolean;
  readonly target?: AppSection;
  readonly opensSettings?: boolean;
  readonly opensSync?: boolean;
}

const MORE_SECTIONS: readonly MoreSectionItem[] = [
  {
    title: 'Синхронизация',
    description: 'Доверенные устройства, сквозное шифрование и восстановление доступа.',
    icon: 'lock',
    available: true,
    opensSync: true,
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
    description: 'Запланированные прогулки по типам.',
    icon: 'walks',
    available: true,
    target: APP_SECTION.walks,
  },
  {
    title: 'Вечерняя аналитика',
    description: 'Закономерности завершения дня, сигналы и рекомендации на завтра.',
    icon: 'statistics',
    available: true,
    target: APP_SECTION.eveningAnalytics,
  },
  {
    title: 'Сферы',
    description: 'Области жизни, к которым относятся ваши решения и действия.',
    icon: 'spheres',
    available: true,
    target: APP_SECTION.spheres,
  },
];

export function MorePage(props: MorePageProps) {
  const [selection, setSelection] = useState<{
    request: number | undefined;
    view: 'index' | 'settings' | 'sync';
  }>({ request: props.syncOpenRequest, view: props.syncOpenRequest ? 'sync' : 'index' });
  const view =
    props.syncOpenRequest && props.syncOpenRequest !== selection.request ? 'sync' : selection.view;
  const setView = (next: 'index' | 'settings' | 'sync') =>
    setSelection({ request: props.syncOpenRequest, view: next });

  if (view === 'settings') {
    return <LocalSettingsPage {...props} onBack={() => setView('index')} />;
  }
  if (view === 'sync') {
    return <SyncPage sync={props.sync} onBack={() => setView('index')} />;
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
                  } else if (item.opensSync === true) {
                    setView('sync');
                  }
                }}
              >
                <MoreSectionContent
                  item={item}
                  updateAvailable={
                    item.opensSettings === true && props.systemUpdate.state.status === 'available'
                  }
                />
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
            Записи сохраняются на устройстве и доступны без сети. При настроенной синхронизации
            изменения передаются доверенным устройствам в зашифрованном виде.
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
  systemUpdate,
}: LocalSettingsPageProps) {
  const [draft, setDraft] = useState<LocalSettings>(() => ({
    ...copyLocalSettings(settings),
    defaultSection: resolveMenuEntrySection(settings.defaultSection),
  }));
  const [message, setMessage] = useState<string | null>(
    settingsRecoveredFromInvalidValue
      ? 'Повреждённые настройки были заменены безопасными значениями.'
      : null,
  );
  const [messageKind, setMessageKind] = useState<'success' | 'error' | 'notice'>(
    settingsRecoveredFromInvalidValue ? 'notice' : 'success',
  );

  function save(): void {
    if (!isEveningRitualSettings(draft.eveningRitual)) {
      setMessageKind('error');
      setMessage('Проверьте время, длительности и выберите от трёх до шести обязательных пунктов.');
      return;
    }
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

  function updateEveningRitual(patch: Partial<EveningRitualSettings>): void {
    setDraft((current) => ({
      ...current,
      eveningRitual: { ...current.eveningRitual, ...patch },
    }));
  }

  function toggleRequiredItem(key: string, required: boolean): void {
    const selected = new Set(draft.eveningRitual.requiredCoreItems);
    if (required) selected.add(key);
    else selected.delete(key);
    updateEveningRitual({ requiredCoreItems: [...selected] });
  }

  function moveItem(index: number, offset: -1 | 1): void {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= draft.eveningRitual.items.length) return;
    const items = [...draft.eveningRitual.items];
    const current = items[index]!;
    items[index] = items[nextIndex]!;
    items[nextIndex] = current;
    updateEveningRitual({ items });
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
              {APP_SECTION_MENU_OPTIONS.map((section) => (
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

      <section
        className="settings-panel evening-ritual-settings"
        aria-labelledby="evening-settings-heading"
      >
        <div className="settings-panel-heading">
          <div>
            <p className="section-page-eyebrow">Распорядок</p>
            <h2 id="evening-settings-heading">Вечерний ритуал</h2>
          </div>
          <span>Одна базовая настройка на каждый день</span>
        </div>

        <div className="settings-form evening-ritual-basics">
          <label className="settings-field" htmlFor="settings-target-sleep-time">
            <span>Базовое время сна</span>
            <input
              id="settings-target-sleep-time"
              type="time"
              value={draft.eveningRitual.targetSleepTime}
              onChange={(event) => updateEveningRitual({ targetSleepTime: event.target.value })}
            />
          </label>

          <label className="settings-field" htmlFor="settings-relaxation-practice">
            <span>Практика расслабления по умолчанию</span>
            <select
              id="settings-relaxation-practice"
              value={draft.eveningRitual.defaultRelaxationPractice}
              onChange={(event) =>
                updateEveningRitual({
                  defaultRelaxationPractice: event.target.value as RelaxationPractice,
                })
              }
            >
              <option value={RELAXATION_PRACTICE.reading}>Чтение</option>
              <option value={RELAXATION_PRACTICE.breathing}>Дыхание</option>
              <option value={RELAXATION_PRACTICE.stretching}>Растяжка</option>
              <option value={RELAXATION_PRACTICE.meditation}>Медитация</option>
              <option value={RELAXATION_PRACTICE.calmMusic}>Спокойная музыка</option>
            </select>
          </label>

          <label className="settings-field" htmlFor="settings-screen-free-duration">
            <span>Без экранов по умолчанию</span>
            <input
              id="settings-screen-free-duration"
              type="number"
              min="20"
              max="30"
              step="1"
              value={draft.eveningRitual.defaultScreenFreeDuration}
              onChange={(event) =>
                updateEveningRitual({ defaultScreenFreeDuration: Number(event.target.value) })
              }
            />
            <small>От 20 до 30 минут.</small>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.eveningRitual.adaptiveRelaxationEnabled}
              onChange={(event) =>
                updateEveningRitual({ adaptiveRelaxationEnabled: event.target.checked })
              }
            />
            <span>
              <strong>Адаптивное расслабление</strong>
              <small>Использовать только явно сохранённую практику прошлого вечера.</small>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.eveningRitual.notificationEnabled}
              onChange={(event) =>
                updateEveningRitual({ notificationEnabled: event.target.checked })
              }
            />
            <span>
              <strong>Одно вечернее напоминание</strong>
              <small>Показать встроенное напоминание за 30 минут до сна.</small>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={draft.eveningRitual.allowConsciousSkip}
              onChange={(event) =>
                updateEveningRitual({ allowConsciousSkip: event.target.checked })
              }
            />
            <span>
              <strong>Разрешить осознанный пропуск</strong>
              <small>Показывать нейтральный вариант пропуска всего ритуала.</small>
            </span>
          </label>
        </div>

        <fieldset className="settings-fieldset ritual-items-fieldset">
          <legend>Обязательные пункты: {draft.eveningRitual.requiredCoreItems.length} из 6</legend>
          <p className="settings-field-hint">
            Выберите от трёх до шести пунктов. Порядок задаёт приоритет.
          </p>
          <div className="ritual-settings-list">
            {draft.eveningRitual.items.map((item, index) => {
              const catalogItem = EVENING_RITUAL_ITEM_CATALOG.find(
                (entry) => entry.key === item.key,
              );
              if (catalogItem === undefined) return null;
              return (
                <div className="ritual-settings-item" key={item.key}>
                  <label className="ritual-required-toggle">
                    <input
                      type="checkbox"
                      checked={draft.eveningRitual.requiredCoreItems.includes(item.key)}
                      onChange={(event) => toggleRequiredItem(item.key, event.target.checked)}
                    />
                    <span>
                      <strong>{catalogItem.title}</strong>
                      <small>
                        {draft.eveningRitual.requiredCoreItems.includes(item.key)
                          ? 'Обязательный'
                          : 'Необязательный'}
                      </small>
                    </span>
                  </label>
                  <label className="ritual-duration-field">
                    <span>Рекомендуемая длительность</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      value={item.recommendedDurationMinutes}
                      onChange={(event) => {
                        const items = draft.eveningRitual.items.map((current) =>
                          current.key === item.key
                            ? { ...current, recommendedDurationMinutes: Number(event.target.value) }
                            : current,
                        );
                        updateEveningRitual({ items });
                      }}
                    />
                  </label>
                  <div
                    className="ritual-order-actions"
                    aria-label={`Порядок: ${catalogItem.title}`}
                  >
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label={`Переместить выше: ${catalogItem.title}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === draft.eveningRitual.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label={`Переместить ниже: ${catalogItem.title}`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      </section>

      <SystemUpdatePanel
        state={systemUpdate.state}
        onCheck={systemUpdate.check}
        onInstall={systemUpdate.install}
      />

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
  readonly updateAvailable?: boolean;
}

function MoreSectionContent({ item, updateAvailable = false }: MoreSectionContentProps) {
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
        {updateAvailable ? 'Есть обновление' : item.available ? 'Открыть' : 'Следующий этап'}
      </span>
    </>
  );
}
