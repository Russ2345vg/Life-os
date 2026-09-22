import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SleepScheduleService } from '../../application/sleep/SleepScheduleService';
import {
  unavailableWakeAlarmStatus,
  type AlarmSound,
  type WakeAlarmPermissionIssue,
  type WakeAlarmStatus,
} from '../../application/sleep/WakeAlarmGateway';
import type {
  NightCycle,
  SleepPreparationGroup,
  SleepPreparationItem,
  SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';

export function SleepPreparationPage({
  service,
  onBack,
}: {
  readonly service: SleepScheduleService;
  readonly onBack: () => void;
}) {
  const [state, setState] = useState<SleepScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alarmStatus, setAlarmStatus] = useState<WakeAlarmStatus>(unavailableWakeAlarmStatus());
  const [alarmSounds, setAlarmSounds] = useState<readonly AlarmSound[]>([
    { uri: null, title: 'Системный сигнал' },
  ]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await service.getState();
        const opened = loaded.settings === null ? loaded : await service.openCurrentNight();
        const synchronized =
          opened.settings === null
            ? { state: opened, alarm: await service.getAlarmStatus() }
            : await service.syncAlarm();
        const sounds = await service.listAlarmSounds();
        if (!active) return;
        setState(synchronized.state);
        setAlarmStatus(synchronized.alarm);
        setAlarmSounds(sounds);
      } catch (reason: unknown) {
        if (active) setError(messageOf(reason));
      }
    })();
    return () => {
      active = false;
    };
  }, [service]);

  const run = async (work: () => Promise<SleepScheduleState>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await work());
      setAlarmStatus(await service.getAlarmStatus());
    } catch (reason: unknown) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return (
      <section className="sleep-page sleep-page--loading" aria-live="polite">
        <p role={error ? 'alert' : 'status'}>{error ?? 'Загружаем подготовку…'}</p>
      </section>
    );
  }

  return (
    <SleepPreparationView
      state={state}
      busy={busy}
      error={error}
      alarmStatus={alarmStatus}
      alarmSounds={alarmSounds}
      onBack={onBack}
      onSaveSettings={(input) =>
        run(async () => {
          await service.saveSettings(input);
          return service.openCurrentNight();
        })
      }
      onComplete={(itemId, done) =>
        run(() => (done ? service.completeItem(itemId) : service.reopenItem(itemId)))
      }
      onFinish={(kind) => run(() => service.finish(kind))}
      onAddGroup={(title) => run(() => service.addGroup(title))}
      onRenameGroup={(id, title) => run(() => service.renameGroup(id, title))}
      onMoveGroup={(id, position) => run(() => service.moveGroup(id, position))}
      onDeleteGroup={(id, target) => run(() => service.deleteGroup(id, target))}
      onAddItem={(groupId, title) => run(() => service.addCustomItem(groupId, title))}
      onRenameItem={(id, title) => run(() => service.renameItem(id, title))}
      onEnableItem={(id, enabled) => run(() => service.setItemEnabled(id, enabled))}
      onDeleteItem={(id) => run(() => service.deleteItem(id))}
      onMoveItem={(id, groupId, position) => run(() => service.moveItem(id, groupId, position))}
      onScheduleTestAlarm={() => {
        if (busy) return;
        setBusy(true);
        setError(null);
        void service
          .scheduleTestAlarm()
          .then(setAlarmStatus)
          .catch((reason: unknown) => setError(messageOf(reason)))
          .finally(() => setBusy(false));
      }}
      onOpenAlarmSettings={(issue) => {
        setError(null);
        void service
          .openAlarmSettings(issue)
          .catch((reason: unknown) => setError(messageOf(reason)));
      }}
      onSkipNearestAlarm={() => run(() => service.skipNearestWake())}
    />
  );
}

export function SleepPreparationView({
  state,
  busy,
  error,
  alarmStatus,
  alarmSounds,
  onBack,
  onSaveSettings,
  onComplete,
  onFinish,
  onAddGroup,
  onRenameGroup,
  onMoveGroup,
  onDeleteGroup,
  onAddItem,
  onRenameItem,
  onEnableItem,
  onDeleteItem,
  onMoveItem,
  onScheduleTestAlarm,
  onOpenAlarmSettings,
  onSkipNearestAlarm,
}: {
  readonly state: SleepScheduleState;
  readonly busy: boolean;
  readonly error: string | null;
  readonly alarmStatus: WakeAlarmStatus;
  readonly alarmSounds: readonly AlarmSound[];
  readonly onBack: () => void;
  readonly onSaveSettings: (input: {
    bedtime: string;
    wakeTime: string;
    timeZone: string;
    enabled: boolean;
    alarmSound?: AlarmSound;
  }) => void;
  readonly onComplete: (itemId: string, done: boolean) => void;
  readonly onFinish: (kind: 'WITH_SKIPS' | 'SKIPPED_TODAY') => void;
  readonly onAddGroup: (title: string) => void;
  readonly onRenameGroup: (id: string, title: string) => void;
  readonly onMoveGroup: (id: string, position: number) => void;
  readonly onDeleteGroup: (id: string, targetGroupId?: string) => void;
  readonly onAddItem: (groupId: string, title: string) => void;
  readonly onRenameItem: (id: string, title: string) => void;
  readonly onEnableItem: (id: string, enabled: boolean) => void;
  readonly onDeleteItem: (id: string) => void;
  readonly onMoveItem: (id: string, groupId: string, position: number) => void;
  readonly onScheduleTestAlarm: () => void;
  readonly onOpenAlarmSettings: (issue: WakeAlarmPermissionIssue) => void;
  readonly onSkipNearestAlarm: () => void;
}) {
  const timeZone = useMemo(
    () => state.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [state.settings?.timeZone],
  );
  const cycle = latestCycle(state.nightCycles);
  const completed = cycle?.preparationCompletionKind !== null && cycle !== undefined;
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (state.settings === null) {
    return (
      <section className="sleep-page sleep-page--setup">
        <button className="sleep-back" type="button" onClick={onBack}>
          ← Сегодня
        </button>
        <p className="planner-eyebrow">Сон и подъём</p>
        <h1>Настройте своё время</h1>
        <p className="sleep-lead">
          Укажите реальное время сна и подъёма. Значения из макета не сохраняются автоматически.
        </p>
        <SettingsForm
          timeZone={timeZone}
          alarmSounds={alarmSounds}
          busy={busy}
          onSave={onSaveSettings}
        />
        {error ? (
          <p className="planner-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const groups = cycle ? groupedSnapshot(cycle, state.preparationGroups) : [];

  return (
    <section className="sleep-page">
      <header className="sleep-topbar">
        <button
          className="sleep-back"
          type="button"
          onClick={onBack}
          aria-label="Вернуться к сегодня"
        >
          ←
        </button>
        <div className="sleep-title-block">
          <h1>Подготовка ко сну</h1>
          <p>Спокойный вечер — лёгкое утро</p>
        </div>
        <div className="sleep-topbar-actions">
          <span className="sleep-date">
            {formatCycleDate(cycle?.cycleDate, state.settings.timeZone)}
          </span>
          <button type="button" aria-label="Календарь" onClick={onBack}>
            ▣
          </button>
          <button type="button" aria-label="Другие действия">
            •••
          </button>
        </div>
      </header>

      {error ? (
        <p className="planner-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="sleep-hero" aria-label="Время до сна">
        <span className="sleep-hero__moon" aria-hidden="true">
          <SleepMoonIcon />
        </span>
        <div className="sleep-countdown-ring">
          <div>
            <small>До сна осталось</small>
            <strong>{countdownLabel(cycle)}</strong>
            <span>
              Ложиться около
              <br />
              {state.settings.bedtime}
            </span>
          </div>
        </div>
        <blockquote>
          Хороший сон
          <br />
          сегодня — больше
          <br />
          сил для важных дел
          <br />
          завтра.
          <span aria-hidden="true" />
        </blockquote>
      </section>

      <div className="sleep-alarm-mobile-status">
        <AlarmStatusPanel
          status={alarmStatus}
          expectedSettingsVersion={state.settings.version}
          wakeTime={state.settings.wakeTime}
          timeZone={state.settings.timeZone}
          busy={busy}
          onScheduleTest={onScheduleTestAlarm}
          onOpenSettings={onOpenAlarmSettings}
          onSkipNearest={onSkipNearestAlarm}
        />
      </div>

      <div className="sleep-layout">
        <main className="sleep-checklist">
          <div className="sleep-section-heading">
            <div>
              <h2>Список подготовки</h2>
              <span>{progressLabel(cycle)}</span>
              <button type="button" aria-label="Действия со списком">
                ⋮
              </button>
            </div>
            <details
              className="sleep-settings"
              open={settingsOpen}
              onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
            >
              <summary>
                <span aria-hidden="true">
                  <SleepGlyph kind="settings" />
                </span>
                <span>Настроить</span>
              </summary>
              <div className="sleep-settings__body">
                <button
                  className="sleep-settings__close"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                >
                  Закрыть
                </button>
                <SettingsForm
                  bedtime={state.settings.bedtime}
                  wakeTime={state.settings.wakeTime}
                  timeZone={state.settings.timeZone}
                  enabled={state.settings.enabled}
                  alarmSound={state.settings.alarmSound}
                  alarmSounds={alarmSounds}
                  busy={busy}
                  onSave={onSaveSettings}
                />
                <CatalogEditor
                  groups={state.preparationGroups}
                  items={state.preparationItems}
                  busy={busy}
                  onAddGroup={onAddGroup}
                  onRenameGroup={onRenameGroup}
                  onMoveGroup={onMoveGroup}
                  onDeleteGroup={onDeleteGroup}
                  onAddItem={onAddItem}
                  onRenameItem={onRenameItem}
                  onMoveItem={onMoveItem}
                  onEnableItem={onEnableItem}
                  onDeleteItem={onDeleteItem}
                />
              </div>
            </details>
          </div>

          {cycle === null ? (
            <p role="status">Создаём список текущей ночи…</p>
          ) : (
            <div className="sleep-groups">
              {groups.map((group) => (
                <section className="sleep-check-group" key={group.id}>
                  <header>
                    <span className="sleep-group-icon" aria-hidden="true">
                      <SleepGlyph kind={groupIcon(group.title)} />
                    </span>
                    <h3>{group.title}</h3>
                    <span>
                      {group.items.filter(({ status }) => status === 'DONE').length}/
                      {group.items.length}
                    </span>
                    <span aria-hidden="true">⌄</span>
                  </header>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.status === 'DONE'}
                            disabled={busy || completed || item.status === 'SKIPPED'}
                            onChange={(event) => onComplete(item.id, event.currentTarget.checked)}
                          />
                          <span className="sleep-item-icon" aria-hidden="true">
                            <SleepGlyph kind={itemIcon(item.title)} />
                          </span>
                          <span className={item.status === 'SKIPPED' ? 'sleep-item--skipped' : ''}>
                            {item.title}
                          </span>
                          {item.status === 'SKIPPED' ? <small>Пропущено</small> : null}
                          <span className="sleep-item-menu" aria-hidden="true">
                            ⋮
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="sleep-add-actions">
            <button type="button" onClick={() => setSettingsOpen(true)}>
              ＋ Добавить пункт
            </button>
            <button type="button" onClick={() => setSettingsOpen(true)}>
              ＋ Добавить группу
            </button>
          </div>
        </main>

        <aside className="sleep-summary">
          <section className="sleep-summary-card sleep-summary-card--schedule">
            <header>
              <h2>Мой сон</h2>
              <button type="button" onClick={() => setSettingsOpen(true)}>
                Изменить
              </button>
            </header>
            <div>
              <span aria-hidden="true">
                <SleepGlyph kind="moon" />
              </span>
              <span>Время сна</span>
              <strong>{state.settings.bedtime}</strong>
            </div>
            <div>
              <span aria-hidden="true">
                <SleepGlyph kind="morning" />
              </span>
              <span>Время подъёма</span>
              <strong>{state.settings.wakeTime}</strong>
            </div>
            <AlarmStatusPanel
              status={alarmStatus}
              expectedSettingsVersion={state.settings.version}
              wakeTime={state.settings.wakeTime}
              timeZone={state.settings.timeZone}
              busy={busy}
              onScheduleTest={onScheduleTestAlarm}
              onOpenSettings={onOpenAlarmSettings}
              onSkipNearest={onSkipNearestAlarm}
            />
          </section>

          <section className="sleep-summary-card sleep-summary-card--dnd">
            <header>
              <span className="sleep-card-icon" aria-hidden="true">
                <SleepGlyph kind="dnd" />
              </span>
              <div>
                <h2>Режим «Не беспокоить»</h2>
                <p>Выключится за 30 минут до сна.</p>
              </div>
              <span className="sleep-switch" aria-label="Режим не беспокоить включён" />
            </header>
            <p>Разрешены будильники и важные уведомления.</p>
          </section>

          <section className="sleep-summary-card sleep-summary-card--reminders">
            <header>
              <span className="sleep-card-icon" aria-hidden="true">
                <SleepGlyph kind="reminder" />
              </span>
              <h2>Напоминания</h2>
            </header>
            {['За 60 минут до сна', 'За 15 минут до сна', 'Доброе утро'].map((label) => (
              <div key={label}>
                <span>{label}</span>
                <span className="sleep-switch" aria-hidden="true" />
              </div>
            ))}
          </section>

          <section className="sleep-finish-actions">
            <button
              className="planner-primary"
              type="button"
              disabled={busy || completed || cycle === null}
              onClick={() => onFinish('WITH_SKIPS')}
            >
              <span aria-hidden="true">✓</span> Завершить подготовку
            </button>
            <button
              type="button"
              disabled={busy || completed || cycle === null}
              onClick={() => onFinish('SKIPPED_TODAY')}
            >
              <span aria-hidden="true">↬</span> Пропустить на сегодня
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}

function AlarmStatusPanel({
  status,
  expectedSettingsVersion,
  wakeTime,
  timeZone,
  busy,
  onScheduleTest,
  onOpenSettings,
  onSkipNearest,
}: {
  readonly status: WakeAlarmStatus;
  readonly expectedSettingsVersion: number;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly busy: boolean;
  readonly onScheduleTest: () => void;
  readonly onOpenSettings: (issue: WakeAlarmPermissionIssue) => void;
  readonly onSkipNearest: () => void;
}) {
  const label = alarmStatusLabel(status, expectedSettingsVersion, wakeTime, timeZone);
  return (
    <section className={`sleep-alarm-status sleep-alarm-status--${status.state.toLowerCase()}`}>
      <div className="sleep-alarm-status__heading">
        <span>Будильник Android</span>
        <strong>{label}</strong>
      </div>
      {status.message ? <small>{status.message}</small> : null}
      {status.issues.length > 0 ? (
        <div className="sleep-alarm-permissions" aria-label="Разрешения Android">
          {status.issues.map((issue) => (
            <button type="button" key={issue} disabled={busy} onClick={() => onOpenSettings(issue)}>
              {alarmIssueLabel(issue)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="sleep-alarm-actions">
        <button
          type="button"
          disabled={busy || !status.supported || status.issues.length > 0}
          onClick={onScheduleTest}
        >
          Пробный сигнал
        </button>
        <button
          type="button"
          disabled={busy || status.state !== 'SCHEDULED'}
          onClick={onSkipNearest}
        >
          Пропустить ближайший
        </button>
      </div>
    </section>
  );
}

function alarmStatusLabel(
  status: WakeAlarmStatus,
  expectedSettingsVersion: number,
  wakeTime: string,
  timeZone: string,
): string {
  if (!status.supported) return 'Ожидает применения на Android';
  if (status.state === 'PERMISSION_REQUIRED') return 'Требуются разрешения Android';
  if (status.state === 'ERROR') return 'Ошибка постановки';
  if (status.state === 'RINGING') return 'Сигнал звучит';
  if (
    status.state === 'SCHEDULED' &&
    status.acknowledgedSettingsVersion === expectedSettingsVersion &&
    status.nextScheduledAt !== null
  ) {
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(status.nextScheduledAt);
    return `Установлен на ${time}`;
  }
  if (status.state === 'READY') return 'Расписание выключено';
  return `Ожидает постановки на ${wakeTime}`;
}

function alarmIssueLabel(issue: WakeAlarmPermissionIssue): string {
  if (issue === 'EXACT_ALARM') return 'Точные будильники';
  if (issue === 'NOTIFICATIONS') return 'Уведомления';
  return 'Полный экран';
}

function SettingsForm({
  bedtime = '',
  wakeTime = '',
  timeZone,
  enabled = true,
  alarmSound = { uri: null, title: 'Системный сигнал' },
  alarmSounds,
  busy,
  onSave,
}: {
  readonly bedtime?: string;
  readonly wakeTime?: string;
  readonly timeZone: string;
  readonly enabled?: boolean;
  readonly alarmSound?: AlarmSound;
  readonly alarmSounds: readonly AlarmSound[];
  readonly busy: boolean;
  readonly onSave: (input: {
    bedtime: string;
    wakeTime: string;
    timeZone: string;
    enabled: boolean;
    alarmSound?: AlarmSound;
  }) => void;
}) {
  return (
    <form
      className="sleep-time-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const selectedUri = String(data.get('alarmSoundUri') ?? '');
        const selectedSound =
          alarmSounds.find((sound) => (sound.uri ?? '') === selectedUri) ?? alarmSound;
        onSave({
          bedtime: String(data.get('bedtime')),
          wakeTime: String(data.get('wakeTime')),
          timeZone: String(data.get('timeZone')),
          enabled: data.get('enabled') === 'on',
          alarmSound: selectedSound,
        });
      }}
    >
      <label>
        Сон
        <input name="bedtime" type="time" defaultValue={bedtime} required />
      </label>
      <label>
        Подъём
        <input name="wakeTime" type="time" defaultValue={wakeTime} required />
      </label>
      <label className="sleep-time-zone">
        Часовой пояс
        <input name="timeZone" defaultValue={timeZone} required />
      </label>
      <label className="sleep-alarm-sound">
        Звук будильника
        <select name="alarmSoundUri" defaultValue={alarmSound.uri ?? ''}>
          {alarmSounds.map((sound) => (
            <option key={`${sound.uri ?? 'default'}:${sound.title}`} value={sound.uri ?? ''}>
              {sound.title}
            </option>
          ))}
        </select>
      </label>
      <label className="sleep-toggle">
        <input name="enabled" type="checkbox" defaultChecked={enabled} /> Расписание включено
      </label>
      <button className="planner-primary" type="submit" disabled={busy}>
        Сохранить время
      </button>
    </form>
  );
}

function CatalogEditor({
  groups,
  items,
  busy,
  onAddGroup,
  onRenameGroup,
  onMoveGroup,
  onDeleteGroup,
  onAddItem,
  onRenameItem,
  onEnableItem,
  onDeleteItem,
  onMoveItem,
}: {
  readonly groups: readonly SleepPreparationGroup[];
  readonly items: readonly SleepPreparationItem[];
  readonly busy: boolean;
  readonly onAddGroup: (title: string) => void;
  readonly onRenameGroup: (id: string, title: string) => void;
  readonly onMoveGroup: (id: string, position: number) => void;
  readonly onDeleteGroup: (id: string, targetGroupId?: string) => void;
  readonly onAddItem: (groupId: string, title: string) => void;
  readonly onRenameItem: (id: string, title: string) => void;
  readonly onEnableItem: (id: string, enabled: boolean) => void;
  readonly onDeleteItem: (id: string) => void;
  readonly onMoveItem: (id: string, groupId: string, position: number) => void;
}) {
  const orderedGroups = [...groups].sort((left, right) => left.position - right.position);
  return (
    <div className="sleep-catalog">
      <div className="sleep-catalog-heading">
        <div>
          <h2>Повторяемый список</h2>
          <p>Изменения применятся к следующей новой ночи.</p>
        </div>
        <QuickForm
          label="Новая группа"
          placeholder="Название группы"
          busy={busy}
          onSubmit={onAddGroup}
        />
      </div>
      {orderedGroups.map((group, groupIndex) => {
        const groupItems = items
          .filter((item) => item.groupId === group.id)
          .sort((left, right) => left.position - right.position);
        return (
          <section className="sleep-catalog-group" key={group.id}>
            <div className="sleep-catalog-group__heading">
              <QuickForm
                label={`Переименовать группу ${group.title}`}
                value={group.title}
                busy={busy}
                button="Сохранить"
                onSubmit={(title) => onRenameGroup(group.id, title)}
              />
              <div className="sleep-order-actions">
                <button
                  type="button"
                  aria-label={`Поднять группу ${group.title}`}
                  disabled={busy || groupIndex === 0}
                  onClick={() => onMoveGroup(group.id, groupIndex - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Опустить группу ${group.title}`}
                  disabled={busy || groupIndex === orderedGroups.length - 1}
                  onClick={() => onMoveGroup(group.id, groupIndex + 1)}
                >
                  ↓
                </button>
              </div>
            </div>
            <ul>
              {groupItems.map((item, itemIndex) => (
                <li key={item.id} className={!item.enabled ? 'sleep-catalog-item--disabled' : ''}>
                  {item.kind === 'CUSTOM' ? (
                    <QuickForm
                      label={`Переименовать ${item.title}`}
                      value={item.title}
                      busy={busy}
                      button="Сохранить"
                      onSubmit={(title) => onRenameItem(item.id, title)}
                    />
                  ) : (
                    <span>
                      <strong>{item.title}</strong>
                      <small>Базовый пункт</small>
                    </span>
                  )}
                  <select
                    aria-label={`Группа для ${item.title}`}
                    value={item.groupId}
                    disabled={busy}
                    onChange={(event) => onMoveItem(item.id, event.currentTarget.value, 999)}
                  >
                    {orderedGroups.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.title}
                      </option>
                    ))}
                  </select>
                  <div className="sleep-order-actions">
                    <button
                      type="button"
                      aria-label={`Поднять ${item.title}`}
                      disabled={busy || itemIndex === 0}
                      onClick={() => onMoveItem(item.id, group.id, itemIndex - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Опустить ${item.title}`}
                      disabled={busy || itemIndex === groupItems.length - 1}
                      onClick={() => onMoveItem(item.id, group.id, itemIndex + 1)}
                    >
                      ↓
                    </button>
                  </div>
                  {item.kind === 'CUSTOM' ? (
                    <>
                      <label className="sleep-enable">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          disabled={busy}
                          onChange={(event) => onEnableItem(item.id, event.currentTarget.checked)}
                        />{' '}
                        Активен
                      </label>
                      <button type="button" disabled={busy} onClick={() => onDeleteItem(item.id)}>
                        Удалить
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            <QuickForm
              label={`Добавить пункт в ${group.title}`}
              placeholder="Новый пункт"
              busy={busy}
              onSubmit={(title) => onAddItem(group.id, title)}
            />
            <form
              className="sleep-delete-group"
              onSubmit={(event) => {
                event.preventDefault();
                const target =
                  String(new FormData(event.currentTarget).get('target') ?? '') || undefined;
                onDeleteGroup(group.id, target);
              }}
            >
              {groupItems.length ? (
                <select
                  name="target"
                  aria-label={`Куда перенести пункты группы ${group.title}`}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Перенести пункты в…
                  </option>
                  {orderedGroups
                    .filter(({ id }) => id !== group.id)
                    .map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.title}
                      </option>
                    ))}
                </select>
              ) : null}
              <button type="submit" disabled={busy || orderedGroups.length === 1}>
                Удалить группу
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}

function QuickForm({
  label,
  placeholder,
  value,
  button = 'Добавить',
  busy,
  onSubmit,
}: {
  readonly label: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly button?: string;
  readonly busy: boolean;
  readonly onSubmit: (value: string) => void;
}) {
  return (
    <form
      className="sleep-quick-form"
      aria-label={label}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem('title');
        if (!(input instanceof HTMLInputElement) || !input.value.trim()) return;
        onSubmit(input.value.trim());
        if (value === undefined) input.value = '';
      }}
    >
      <input
        name="title"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={value}
        required
      />
      <button type="submit" disabled={busy}>
        {button}
      </button>
    </form>
  );
}

function latestCycle(cycles: readonly NightCycle[]): NightCycle | null {
  return (
    [...cycles].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
    null
  );
}

function groupedSnapshot(
  cycle: NightCycle,
  configuredGroups: readonly SleepPreparationGroup[],
): ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly items: NightCycle['preparationItems'];
}> {
  const groups = new Map<
    string,
    { title: string; items: NightCycle['preparationItems'][number][] }
  >();
  for (const group of [...configuredGroups].sort((left, right) => left.position - right.position)) {
    groups.set(group.id, { title: group.title, items: [] });
  }
  for (const item of cycle.preparationItems) {
    const group = groups.get(item.groupId) ?? { title: item.groupTitle, items: [] };
    group.items.push(item);
    groups.set(item.groupId, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
}

function progressLabel(cycle: NightCycle | null): string {
  if (cycle === null) return '—';
  return `${cycle.preparationItems.filter(({ status }) => status === 'DONE').length} / ${cycle.preparationItems.length}`;
}

function formatCycleDate(cycleDate: string | undefined, timeZone: string): string {
  const date = cycleDate ? new Date(`${cycleDate}T12:00:00`) : new Date();
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function countdownLabel(cycle: NightCycle | null): string {
  if (cycle === null) return '—:—';
  const remaining = Math.max(0, cycle.plannedSleepAt.getTime() - Date.now());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return [hours, minutes].map((value) => String(value).padStart(2, '0')).join(':');
}

type SleepGlyphKind =
  | 'room'
  | 'morning'
  | 'personal'
  | 'air'
  | 'bed'
  | 'clothes'
  | 'water'
  | 'phone'
  | 'bag'
  | 'moon'
  | 'dnd'
  | 'reminder'
  | 'settings'
  | 'dot';

function groupIcon(title: string): SleepGlyphKind {
  const normalized = title.toLocaleLowerCase('ru-RU');
  if (normalized.includes('комнат')) return 'room';
  if (normalized.includes('утр')) return 'morning';
  return 'personal';
}

function itemIcon(title: string): SleepGlyphKind {
  const normalized = title.toLocaleLowerCase('ru-RU');
  if (normalized.includes('комнат')) return 'air';
  if (normalized.includes('кроват')) return 'bed';
  if (normalized.includes('одеж')) return 'clothes';
  if (normalized.includes('вод')) return 'water';
  if (normalized.includes('телефон')) return 'phone';
  if (normalized.includes('сумк')) return 'bag';
  return 'dot';
}

function SleepGlyph({ kind }: { readonly kind: SleepGlyphKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'room' ? (
        <>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v10h13V10" />
          <path d="M9.5 20v-6h5v6M16 7V4h2v5" />
        </>
      ) : kind === 'morning' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
        </>
      ) : kind === 'personal' ? (
        <>
          <circle cx="12" cy="7" r="3" />
          <path d="M5 21c.6-5 2.8-8 7-8s6.4 3 7 8" />
        </>
      ) : kind === 'air' ? (
        <>
          <circle cx="12" cy="12" r="2" />
          <path d="M12 10c-1-4 1-6 3-6 2.5 0 3.5 3-1 7M14 12c4-1 6 1 6 3 0 2.5-3 3.5-7-1M11 14c-2 4-5 4-6 2-1.3-2.2.8-4.6 5-4" />
        </>
      ) : kind === 'bed' ? (
        <>
          <path d="M3 19v-9M21 19v-6H3M7 13V8h5a4 4 0 0 1 4 4v1M3 17h18" />
        </>
      ) : kind === 'clothes' ? (
        <path d="m8 4 4 2 4-2 5 4-3 4-2-2v10H8V10l-2 2-3-4 5-4Z" />
      ) : kind === 'water' ? (
        <>
          <path d="M6 4h12l-1.5 16h-9L6 4Z" />
          <path d="M7.1 10.5c1.7-1.2 3.3 1.2 5 0s3.2.8 4.8 0" />
        </>
      ) : kind === 'phone' ? (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2" />
          <path d="M10 5h4M11 18.5h2" />
        </>
      ) : kind === 'bag' ? (
        <>
          <path d="M4 8h16l-1 12H5L4 8Z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </>
      ) : kind === 'moon' ? (
        <path
          d="M18.5 16.8A8 8 0 0 1 8 5.5 8.2 8.2 0 1 0 18.5 16.8Z"
          fill="currentColor"
          stroke="none"
        />
      ) : kind === 'dnd' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m7 17 10-10" />
        </>
      ) : kind === 'reminder' ? (
        <>
          <path d="M6 17h12l-2-3v-3a4 4 0 0 0-8 0v3l-2 3Z" />
          <path d="M10 20h4" />
        </>
      ) : kind === 'settings' ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </>
      ) : (
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Не удалось сохранить подготовку.';
}

export function SleepMoonIcon() {
  return (
    <svg
      className="sleep-moon-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.5 16.8A8 8 0 0 1 8 5.5 8.2 8.2 0 1 0 18.5 16.8Z" />
    </svg>
  );
}
