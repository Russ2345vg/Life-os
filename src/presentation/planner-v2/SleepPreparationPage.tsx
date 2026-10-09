import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuickAccessGuard, useQuickAccessUncontrolledForm } from './QuickAccessContext';
import type { SleepScheduleService } from '../../application/sleep/SleepScheduleService';
import type { SleepObservationService } from '../../application/sleep/SleepObservationService';
import type { SleepAlarmObservationCoordinator } from '../../application/sleep/SleepAlarmObservationCoordinator';
import {
  isConfirmedSleepObservation,
  type SleepObservation,
} from '../../domain/sleep/SleepObservation';
import {
  unavailableWakeAlarmStatus,
  unavailableWakeDismissalSetup,
  type AlarmSound,
  type WakeAlarmPermissionIssue,
  type WakeAlarmStatus,
  type WakeDismissalSetup,
} from '../../application/sleep/WakeAlarmGateway';
import type {
  NightCycle,
  SleepPreparationGroup,
  SleepPreparationItem,
  SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';
import { selectSleepHistoryEntries, summarizeSleepHistory } from '../../domain/sleep/SleepSchedule';
import { nominalSleepDurationMinutes } from '../../domain/sleep/NightTime';
import { summarizeEveningHistory } from './eveningHistoryModel';
import { EveningDayClosure, type EveningPlannerServices } from './EveningDayClosure';
import { WakeManagementPanel } from './WakeManagementPanel';
import { isWakeScheduleAcknowledged, wakeProbeLabel } from './wakeManagementModel';
import { SleepObservationForm } from './sleep/SleepObservationForm';
import { SleepObservationChart } from './sleep/SleepObservationChart';
import './evening-support.css';

export function SleepPreparationPage({
  service,
  observationService,
  alarmObservations,
  onBack,
  backLabel = 'Сегодня',
  plannerServices,
  calendarDate,
}: {
  readonly service: SleepScheduleService;
  readonly observationService: SleepObservationService;
  readonly alarmObservations: SleepAlarmObservationCoordinator;
  readonly onBack: () => void;
  readonly backLabel?: string;
  readonly plannerServices?: EveningPlannerServices;
  readonly calendarDate?: string;
}) {
  const [state, setState] = useState<SleepScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [observation, setObservation] = useState<SleepObservation | null>(null);
  const [observationBusy, setObservationBusy] = useState(false);
  const [observationError, setObservationError] = useState<string | null>(null);
  const [observationSaved, setObservationSaved] = useState(false);
  const [observationHistory, setObservationHistory] = useState<readonly SleepObservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pageOpenedAt] = useState(() => Date.now());
  useQuickAccessGuard(() => ({ dirty: false, busy }));
  const [alarmStatus, setAlarmStatus] = useState<WakeAlarmStatus>(unavailableWakeAlarmStatus());
  const [alarmSounds, setAlarmSounds] = useState<readonly AlarmSound[]>([
    { uri: null, title: 'Системный сигнал' },
  ]);
  const [dismissalSetup, setDismissalSetup] = useState<WakeDismissalSetup>(
    unavailableWakeDismissalSetup(),
  );
  const busyRef = useRef(busy);
  const loadedRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    let active = true;
    loadedRef.current = false;
    void (async () => {
      try {
        const loaded = await service.getState();
        const opened = loaded.settings === null ? loaded : await service.openCurrentNight();
        const synchronized =
          opened.settings === null
            ? { state: opened, alarm: await service.getAlarmStatus() }
            : await alarmObservations.sync();
        const [sounds, loadedDismissalSetup] = await Promise.all([
          service.listAlarmSounds(),
          service.getWakeDismissalSetup(),
        ]);
        if (!active) return;
        setState(synchronized.state);
        setAlarmStatus(synchronized.alarm);
        setAlarmSounds(sounds);
        setDismissalSetup(loadedDismissalSetup);
        const [latestObservation, history] = await Promise.all([
          observationForLatestCycle(observationService, synchronized.state),
          observationHistoryForState(observationService, synchronized.state),
        ]);
        setObservation(latestObservation);
        setObservationHistory(history);
        setHistoryLoading(false);
        loadedRef.current = true;
      } catch (reason: unknown) {
        if (active) {
          setError(messageOf(reason));
          setHistoryError(messageOf(reason));
          setHistoryLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [alarmObservations, observationService, service]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = () => {
      if (
        !active ||
        pending ||
        busyRef.current ||
        !loadedRef.current ||
        document.visibilityState === 'hidden'
      )
        return;
      pending = true;
      busyRef.current = true;
      setBusy(true);
      void (async () => {
        try {
          const [synchronized, setup] = await Promise.all([
            alarmObservations.sync(),
            service.getWakeDismissalSetup(),
          ]);
          if (active) {
            setState(synchronized.state);
            setAlarmStatus(synchronized.alarm);
            setDismissalSetup(setup);
            const [latestObservation, history] = await Promise.all([
              observationForLatestCycle(observationService, synchronized.state),
              observationHistoryForState(observationService, synchronized.state),
            ]);
            setObservation(latestObservation);
            setObservationHistory(history);
            setHistoryError(null);
          }
        } catch (reason: unknown) {
          if (active) setError(messageOf(reason));
        } finally {
          pending = false;
          if (active) {
            busyRef.current = false;
            setBusy(false);
          }
        }
      })();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [alarmObservations, observationService, service]);

  const run = async (work: () => Promise<SleepScheduleState>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setState(await work());
      setAlarmStatus(await service.getAlarmStatus());
      return true;
    } catch (reason: unknown) {
      setError(messageOf(reason));
      try {
        const [current, alarm] = await Promise.all([service.getState(), service.getAlarmStatus()]);
        setState(current);
        setAlarmStatus(alarm);
      } catch {
        /* Keep the original command error when storage is unavailable. */
      }
      return false;
    } finally {
      busyRef.current = false;
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

  const observationCycle = latestCycle(state.nightCycles);
  const showObservation =
    observationCycle !== null &&
    (observation !== null || observationCycle.plannedWakeAt.getTime() <= pageOpenedAt);

  return (
    <SleepPreparationView
      {...(plannerServices ? { plannerServices } : {})}
      {...(calendarDate ? { calendarDate } : {})}
      state={state}
      busy={busy}
      error={error}
      alarmStatus={alarmStatus}
      alarmSounds={alarmSounds}
      dismissalSetup={dismissalSetup}
      morningObservation={
        showObservation && observationCycle !== null ? (
          <SleepObservationForm
            key={`${observationCycle.cycleDate}:${observation?.updatedAt.toISOString() ?? 'new'}`}
            cycleDate={observationCycle.cycleDate}
            timeZone={state.settings?.timeZone ?? observation?.timeZone ?? 'UTC'}
            plannedWentToBedAt={observationCycle.plannedSleepAt}
            observation={observation}
            busy={observationBusy}
            error={observationError}
            saved={observationSaved}
            onSave={async (input) => {
              if (observationBusy) return;
              setObservationBusy(true);
              setObservationError(null);
              setObservationSaved(false);
              try {
                const saved =
                  observation !== null && isConfirmedSleepObservation(observation)
                    ? await observationService.revise({
                        cycleDate: observationCycle.cycleDate,
                        ...input,
                      })
                    : await observationService.confirm({
                        cycleDate: observationCycle.cycleDate,
                        ...input,
                      });
                setObservation(saved);
                setObservationHistory((current) =>
                  [saved, ...current.filter(({ cycleDate }) => cycleDate !== saved.cycleDate)].sort(
                    (left, right) => right.cycleDate.localeCompare(left.cycleDate),
                  ),
                );
                setObservationSaved(true);
              } catch (reason: unknown) {
                setObservationError(messageOf(reason));
              } finally {
                setObservationBusy(false);
              }
            }}
          />
        ) : null
      }
      historyChart={
        <SleepObservationChart
          observations={observationHistory}
          plans={state.nightCycles}
          loading={historyLoading}
          error={historyError}
        />
      }
      onBack={onBack}
      backLabel={backLabel}
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
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        void service
          .scheduleTestAlarm()
          .then(setAlarmStatus)
          .catch((reason: unknown) => setError(messageOf(reason)))
          .finally(() => {
            busyRef.current = false;
            setBusy(false);
          });
      }}
      onOpenAlarmSettings={(issue) => {
        setError(null);
        void service
          .openAlarmSettings(issue)
          .catch((reason: unknown) => setError(messageOf(reason)));
      }}
      onSkipNearestAlarm={(id) => run(() => service.skipNearestWake(id))}
      onSetNearestTime={(time, id) => run(() => service.setNearestWakeTime(time, id))}
      onClearNearestTime={() => run(() => service.clearNearestWakeTime())}
      onSetEnabled={(enabled) => run(() => service.setEnabled(enabled))}
      onSyncAlarm={() =>
        run(async () => {
          const synchronized = await alarmObservations.sync();
          setObservation(await observationForLatestCycle(observationService, synchronized.state));
          setObservationHistory(
            await observationHistoryForState(observationService, synchronized.state),
          );
          return synchronized.state;
        })
      }
      onExportDismissalQr={() => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        void service
          .exportWakeDismissalQr()
          .catch((reason: unknown) => setError(messageOf(reason)))
          .finally(() => {
            busyRef.current = false;
            setBusy(false);
          });
      }}
      onRegenerateDismissalQr={() => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        void service
          .regenerateWakeDismissalQr()
          .then(async (setup) => {
            setDismissalSetup(setup);
            if (setup.qrConfigured) await service.exportWakeDismissalQr();
          })
          .catch((reason: unknown) => setError(messageOf(reason)))
          .finally(() => {
            busyRef.current = false;
            setBusy(false);
          });
      }}
      onSaveEmergencyPhrase={(phrase) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        void service
          .saveWakeEmergencyPhrase(phrase)
          .then(setDismissalSetup)
          .catch((reason: unknown) => setError(messageOf(reason)))
          .finally(() => {
            busyRef.current = false;
            setBusy(false);
          });
      }}
      onToggleQuietMode={(enabled) => run(() => service.setQuietModeEnabled(enabled))}
    />
  );
}

export function SleepPreparationView({
  plannerServices,
  calendarDate,
  state,
  busy,
  error,
  alarmStatus,
  alarmSounds,
  dismissalSetup,
  morningObservation,
  historyChart,
  onBack,
  backLabel = 'Сегодня',
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
  onRegenerateDismissalQr,
  onSaveEmergencyPhrase,
  onToggleQuietMode,
  onSetNearestTime,
  onClearNearestTime,
  onSetEnabled,
  onSyncAlarm,
  onExportDismissalQr,
}: {
  readonly plannerServices?: EveningPlannerServices;
  readonly calendarDate?: string;
  readonly state: SleepScheduleState;
  readonly busy: boolean;
  readonly error: string | null;
  readonly alarmStatus: WakeAlarmStatus;
  readonly alarmSounds: readonly AlarmSound[];
  readonly dismissalSetup: WakeDismissalSetup;
  readonly morningObservation?: ReactNode;
  readonly historyChart?: ReactNode;
  readonly onBack: () => void;
  readonly backLabel?: string;
  readonly onSaveSettings: (input: {
    bedtime: string;
    wakeTime: string;
    timeZone: string;
    enabled: boolean;
    alarmSound?: AlarmSound;
  }) => void;
  readonly onComplete: (itemId: string, done: boolean) => void;
  readonly onFinish: (kind: 'WITH_SKIPS' | 'SKIPPED_TODAY') => void;
  readonly onAddGroup: (title: string) => void | Promise<boolean>;
  readonly onRenameGroup: (id: string, title: string) => void | Promise<boolean>;
  readonly onMoveGroup: (id: string, position: number) => void;
  readonly onDeleteGroup: (id: string, targetGroupId?: string) => void;
  readonly onAddItem: (groupId: string, title: string) => void | Promise<boolean>;
  readonly onRenameItem: (id: string, title: string) => void | Promise<boolean>;
  readonly onEnableItem: (id: string, enabled: boolean) => void;
  readonly onDeleteItem: (id: string) => void;
  readonly onMoveItem: (id: string, groupId: string, position: number) => void;
  readonly onScheduleTestAlarm: () => void;
  readonly onOpenAlarmSettings: (issue: WakeAlarmPermissionIssue) => void;
  readonly onSkipNearestAlarm: (id: string) => void | Promise<boolean>;
  readonly onSetNearestTime?: (time: string, id: string) => void | Promise<boolean>;
  readonly onClearNearestTime?: () => void | Promise<boolean>;
  readonly onSetEnabled?: (enabled: boolean) => void;
  readonly onSyncAlarm?: () => void;
  readonly onExportDismissalQr?: () => void;
  readonly onRegenerateDismissalQr: () => void;
  readonly onSaveEmergencyPhrase: (phrase: string) => void;
  readonly onToggleQuietMode: (enabled: boolean) => void;
}) {
  const timeZone = useMemo(
    () => state.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [state.settings?.timeZone],
  );
  const cycle = latestCycle(state.nightCycles);
  const completed = cycle?.preparationCompletionKind !== null && cycle !== undefined;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    settingsRef.current?.scrollIntoView({ block: 'start' });
    settingsRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [settingsOpen]);

  if (state.settings === null) {
    return (
      <section className="sleep-page sleep-page--setup">
        <button
          className="sleep-back"
          type="button"
          aria-label={`Вернуться к ${backLabel === 'Распорядок' ? 'распорядку' : 'сегодня'}`}
          onClick={onBack}
        >
          ← {backLabel}
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
  const preparationTotal = cycle?.preparationItems.length ?? 0;
  const preparationDone =
    cycle?.preparationItems.filter(({ status }) => status === 'DONE').length ?? 0;
  const preparationPercent =
    preparationTotal > 0 ? Math.round((preparationDone / preparationTotal) * 100) : 0;

  return (
    <section className="sleep-page">
      <header className="sleep-topbar">
        <button
          className="sleep-back"
          type="button"
          onClick={onBack}
          aria-label={`Вернуться к ${backLabel === 'Распорядок' ? 'распорядку' : 'сегодня'}`}
        >
          ←
        </button>
        <div className="sleep-title-block">
          <h1>Сон и подъём</h1>
          <p>Ближайший сигнал и спокойная подготовка</p>
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

      {morningObservation}

      <WakeManagementPanel
        state={state}
        status={alarmStatus}
        busy={busy}
        {...(onSetNearestTime ? { onSetNearestTime } : {})}
        {...(onClearNearestTime ? { onClearNearestTime } : {})}
        {...(onSetEnabled ? { onSetEnabled } : {})}
        onSkipNearest={onSkipNearestAlarm}
        onEditSettings={() => setSettingsOpen(true)}
      >
        <AlarmStatusPanel
          status={alarmStatus}
          expectedSettingsVersion={state.settings.version}
          wakeTime={state.settings.wakeTime}
          timeZone={state.settings.timeZone}
          busy={busy}
          scheduleAcknowledged={isWakeScheduleAcknowledged(state, alarmStatus, new Date())}
          onScheduleTest={onScheduleTestAlarm}
          onOpenSettings={onOpenAlarmSettings}
          {...(onSyncAlarm ? { onSyncAlarm } : {})}
          dismissalSetup={dismissalSetup}
          onRegenerateDismissalQr={onRegenerateDismissalQr}
          {...(onExportDismissalQr ? { onExportDismissalQr } : {})}
          onSaveEmergencyPhrase={onSaveEmergencyPhrase}
        />
      </WakeManagementPanel>

      <div className="sleep-layout">
        <main className="sleep-checklist" aria-label="Подготовка ко сну">
          <div className="sleep-section-heading">
            <div>
              <h2>Список подготовки</h2>
              <span>{cycle ? `${preparationDone} / ${preparationTotal}` : '—'}</span>
              <button type="button" aria-label="Действия со списком">
                ⋮
              </button>
            </div>
            <details
              ref={settingsRef}
              className="sleep-settings"
              open={settingsOpen}
              onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
            >
              <summary aria-label="Настроить подготовку">
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

          {cycle && preparationTotal > 0 ? (
            <div className="sleep-preparation-progress">
              <div>
                <span>Прогресс подготовки</span>
                <strong>{preparationPercent}%</strong>
              </div>
              <div
                className="sleep-preparation-progress__track"
                role="progressbar"
                aria-label="Прогресс вечерней подготовки"
                aria-valuenow={preparationDone}
                aria-valuemin={0}
                aria-valuemax={preparationTotal}
                aria-valuetext={`${preparationDone} из ${preparationTotal} пунктов выполнено`}
              >
                <span style={{ width: `${preparationPercent}%` }} />
              </div>
            </div>
          ) : null}

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
          {plannerServices && cycle ? (
            <EveningDayClosure
              services={plannerServices}
              cycleDate={cycle.cycleDate}
              calendarDate={calendarDate ?? cycle.cycleDate}
            />
          ) : null}
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
            <div>
              <span aria-hidden="true">≈</span>
              <span>Планируется сна</span>
              <strong>
                {formatPlannedSleepDuration(
                  nominalSleepDurationMinutes(state.settings.bedtime, state.settings.wakeTime),
                )}
              </strong>
            </div>
          </section>

          <section className="sleep-summary-card sleep-summary-card--dnd">
            <header>
              <span className="sleep-card-icon" aria-hidden="true">
                <SleepGlyph kind="dnd" />
              </span>
              <div>
                <h2>Режим «Не беспокоить»</h2>
                <p>{quietModeStatusLabel(state.settings.quietModeEnabled, alarmStatus)}</p>
              </div>
              <button
                className={`sleep-switch${state.settings.quietModeEnabled ? '' : ' sleep-switch--off'}`}
                type="button"
                role="switch"
                aria-checked={state.settings.quietModeEnabled}
                aria-label="Режим не беспокоить"
                disabled={busy}
                onClick={() => onToggleQuietMode(!state.settings!.quietModeEnabled)}
              />
            </header>
            <p>
              Разрешены будильники и звонки избранных контактов. Повторные звонки не обходят тишину.
            </p>
            {state.settings.quietModeEnabled &&
            alarmStatus.supported &&
            !alarmStatus.notificationPolicyAccessGranted ? (
              <button
                className="sleep-dnd-permission"
                type="button"
                disabled={busy}
                onClick={() => onOpenAlarmSettings('DND_POLICY')}
              >
                Дать доступ Android
              </button>
            ) : null}
          </section>

          <section className="sleep-summary-card sleep-summary-card--reminders">
            <header>
              <span className="sleep-card-icon" aria-hidden="true">
                <SleepGlyph kind="reminder" />
              </span>
              <h2>Напоминания</h2>
            </header>
            <div>
              <span>За 60 минут до сна</span>
              <strong>{reminderAvailabilityLabel(alarmStatus)}</strong>
            </div>
            <div>
              <span>За 15 минут до сна</span>
              <strong>{completed ? 'Не требуется' : 'По условию'}</strong>
            </div>
            <div>
              <span>В момент сна</span>
              <strong>Всегда</strong>
            </div>
          </section>

          <SleepHistoryPanel state={state} timeZone={state.settings.timeZone} />

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
      {historyChart}
      <div className="sleep-alarm-mobile-status">
        <div className="sleep-history-mobile">
          <SleepHistoryPanel state={state} timeZone={state.settings.timeZone} />
        </div>
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
  scheduleAcknowledged,
  onSyncAlarm,
  onExportDismissalQr,
  dismissalSetup,
  onRegenerateDismissalQr,
  onSaveEmergencyPhrase,
}: {
  readonly status: WakeAlarmStatus;
  readonly expectedSettingsVersion: number;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly busy: boolean;
  readonly onScheduleTest: () => void;
  readonly onOpenSettings: (issue: WakeAlarmPermissionIssue) => void;
  readonly scheduleAcknowledged: boolean;
  readonly onSyncAlarm?: () => void;
  readonly onExportDismissalQr?: () => void;
  readonly dismissalSetup: WakeDismissalSetup;
  readonly onRegenerateDismissalQr: () => void;
  readonly onSaveEmergencyPhrase: (phrase: string) => void;
}) {
  const label = alarmStatusLabel(
    status,
    scheduleAcknowledged ? expectedSettingsVersion : -1,
    wakeTime,
    timeZone,
  );
  return (
    <section className={`sleep-alarm-status sleep-alarm-status--${status.state.toLowerCase()}`}>
      <div className="sleep-alarm-status__heading">
        <span>Будильник Android</span>
        <strong>{label}</strong>
      </div>
      {status.supported && status.message ? <small>{status.message}</small> : null}
      <p
        className={
          status.testEvidence?.valid &&
          status.testEvidence.deliveredAt &&
          status.testEvidence.confirmedAt
            ? 'wake-probe-verified'
            : ''
        }
        role="status"
      >
        {wakeProbeLabel(status, new Date())}
      </p>
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
          Пробный сигнал · 20 секунд
        </button>
        <button type="button" disabled={busy || !onSyncAlarm} onClick={onSyncAlarm}>
          Проверить статус
        </button>
      </div>
      {status.supported ? (
        <small>
          Запустите тест, заблокируйте экран телефона. После звонка нажмите «Я услышал сигнал» на
          экране теста, затем вернитесь сюда.
        </small>
      ) : null}
      {dismissalSetup.supported ? (
        <details>
          <summary>
            QR и аварийная фраза ·{' '}
            {dismissalSetup.qrConfigured && dismissalSetup.emergencyPhraseConfigured
              ? 'настроены'
              : 'нужна настройка'}
          </summary>
          <WakeDismissalSetupPanel
            setup={dismissalSetup}
            busy={busy}
            onRegenerateQr={onRegenerateDismissalQr}
            onSaveEmergencyPhrase={onSaveEmergencyPhrase}
            {...(onExportDismissalQr ? { onExportQr: onExportDismissalQr } : {})}
          />
        </details>
      ) : null}
    </section>
  );
}

function WakeDismissalSetupPanel({
  setup,
  busy,
  onRegenerateQr,
  onSaveEmergencyPhrase,
  onExportQr,
}: {
  readonly setup: WakeDismissalSetup;
  readonly busy: boolean;
  readonly onRegenerateQr: () => void;
  readonly onSaveEmergencyPhrase: (phrase: string) => void;
  readonly onExportQr?: () => void;
}) {
  const phraseForm = useQuickAccessUncontrolledForm(busy);
  const [replace, setReplace] = useState(false);
  return (
    <section className="sleep-dismissal-setup" aria-label="Защита выключения будильника">
      <div className="sleep-dismissal-setup__row">
        <span>
          QR для подъёма
          <small>{setup.qrConfigured ? 'Настроен' : 'Не настроен'}</small>
        </span>
        {setup.qrConfigured ? (
          <div className="wake-management__actions">
            <button type="button" disabled={busy || !onExportQr} onClick={onExportQr}>
              Открыть QR для печати
            </button>
            <button type="button" disabled={busy} onClick={() => setReplace(true)}>
              Заменить QR
            </button>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={onRegenerateQr}>
            Создать и сохранить
          </button>
        )}
      </div>
      {replace ? (
        <div role="group" aria-label="Замена QR">
          <p>Прежний распечатанный QR станет недействительным. Создать новый?</p>
          <div className="wake-management__actions">
            <button type="button" disabled={busy} onClick={() => setReplace(false)}>
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onRegenerateQr();
                setReplace(false);
              }}
            >
              Создать новый QR
            </button>
          </div>
        </div>
      ) : null}
      {setup.qrSavedTo ? <small>Файл: {setup.qrSavedTo}</small> : null}
      <form
        className="sleep-dismissal-setup__phrase"
        ref={phraseForm}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSaveEmergencyPhrase(String(data.get('emergencyPhrase') ?? ''));
          event.currentTarget.reset();
        }}
      >
        <label>
          <span>
            Аварийная фраза
            <small>{setup.emergencyPhraseConfigured ? 'Настроена' : 'Не настроена'}</small>
          </span>
          <input
            name="emergencyPhrase"
            type="password"
            minLength={16}
            autoComplete="new-password"
            placeholder="Не менее 16 символов"
            required
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          Сохранить фразу
        </button>
      </form>
      <small>QR и фраза проверяются локально; прежний QR после замены недействителен.</small>
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
  if (issue === 'DND_POLICY') return 'Доступ к режиму «Не беспокоить»';
  return 'Полный экран';
}

function quietModeStatusLabel(enabled: boolean, status: WakeAlarmStatus): string {
  if (!enabled) return 'Выключен';
  if (!status.supported) return 'Настройка применится на Android';
  if (!status.notificationPolicyAccessGranted) return 'Нужен доступ Android';
  if (status.quietModeState === 'ACTIVE') return 'Активен до подъёма';
  if (status.quietModeState === 'OVERRIDDEN') return 'Изменён вручную до следующего цикла';
  if (status.quietModeState === 'ERROR') return 'Android не подтвердил правило';
  return 'Включится за 60 минут до сна';
}

function reminderAvailabilityLabel(status: WakeAlarmStatus): string {
  if (!status.supported) return 'На Android';
  if (!status.notificationsGranted) return 'Нет доступа';
  return status.nextReminderAt === null ? 'Ожидает' : 'Запланировано';
}

function SleepHistoryPanel({
  state,
  timeZone,
}: {
  readonly state: SleepScheduleState;
  readonly timeZone: string;
}) {
  const summary = summarizeSleepHistory(state);
  const entries = selectSleepHistoryEntries(state).slice(0, 3);
  const cycle = latestCycle(state.nightCycles);
  const evening = cycle ? summarizeEveningHistory(state, cycle.cycleDate) : null;
  return (
    <section className="sleep-summary-card sleep-summary-card--history">
      <h2>Последние 14 вечеров</h2>
      {!evening || evening.recorded === 0 ? (
        <p>Пока нет истории предыдущих вечеров.</p>
      ) : (
        <>
          <p>
            <strong>
              {evening.completed} / {evening.recorded}
            </strong>{' '}
            подготовок завершено
          </p>
          <p>
            <strong>
              {evening.onTime} / {evening.completed}
            </strong>{' '}
            завершено до времени сна
          </p>
          <p>
            Есть записи за {evening.recorded} вечеров. Пропущено: {evening.skipped}. Без завершения:{' '}
            {evening.incomplete}.
          </p>
          {evening.suggestions.length > 0 ? (
            <>
              <h3>Что стоит пересмотреть</h3>
              <ul>
                {evening.suggestions.map((item) => (
                  <li key={item.id}>
                    «{item.title}» осталось невыполненным в {item.missed} из {item.total}{' '}
                    завершённых подготовок.
                  </li>
                ))}
              </ul>
              <p>Возможно, удобнее сделать это раньше или упростить пункт в настройках списка.</p>
            </>
          ) : (
            <p>
              {evening.completed < 5
                ? 'Пока мало данных для устойчивого вывода.'
                : 'Пункты с повторяющимися пропусками не выявлены.'}
            </p>
          )}
        </>
      )}
      <p>Время завершения подготовки не означает фактическое засыпание.</p>
      <header>
        <span className="sleep-card-icon" aria-hidden="true">
          <SleepGlyph kind="history" />
        </span>
        <h2>История сна</h2>
      </header>
      <div className="sleep-history-stats">
        <span>QR {summary.qrDismissals}</span>
        <span>Аварийно {summary.emergencyDismissals}</span>
        <span>Без результата {summary.withoutTrustworthyResult}</span>
        <span>Будильник отключён {summary.alarmDisabled}</span>
        <span>Вода {summary.waterCompleted}</span>
        <span>
          Доля QR{' '}
          {summary.qrShare === null ? 'нет данных' : `${Math.round(summary.qrShare * 100)}%`}
        </span>
      </div>
      {entries.length === 0 ? (
        <p>Записи появятся после первой ночи.</p>
      ) : (
        <ul className="sleep-history-list">
          {entries.map((entry) => (
            <li key={entry.cycleDate}>
              <strong>{formatCycleDate(entry.cycleDate, timeZone)}</strong>
              <span>{preparationHistoryLabel(entry.preparation)}</span>
              <small>
                {wakeHistoryLabel(entry.wakeResult)} · Вода:{' '}
                {entry.waterCompleted ? 'подтверждена' : 'нет отметки'}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function preparationHistoryLabel(
  value: ReturnType<typeof selectSleepHistoryEntries>[number]['preparation'],
): string {
  if (value === 'ALL_DONE') return 'Все пункты выполнены';
  if (value === 'WITH_SKIPS') return 'Завершено с пропусками';
  if (value === 'SKIPPED_TODAY') return 'Подготовка пропущена';
  return 'Нет отметок';
}

function wakeHistoryLabel(
  value: ReturnType<typeof selectSleepHistoryEntries>[number]['wakeResult'],
): string {
  if (value === 'QR') return 'Подъём по QR';
  if (value === 'EMERGENCY') return 'Аварийное отключение';
  if (value === 'ALARM_DISABLED') return 'Будильник заранее отключён';
  return 'Нет достоверного результата';
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
  const settingsForm = useQuickAccessUncontrolledForm(busy);
  return (
    <form
      className="sleep-time-form"
      ref={settingsForm}
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
  readonly onAddGroup: (title: string) => void | Promise<boolean>;
  readonly onRenameGroup: (id: string, title: string) => void | Promise<boolean>;
  readonly onMoveGroup: (id: string, position: number) => void;
  readonly onDeleteGroup: (id: string, targetGroupId?: string) => void;
  readonly onAddItem: (groupId: string, title: string) => void | Promise<boolean>;
  readonly onRenameItem: (id: string, title: string) => void | Promise<boolean>;
  readonly onEnableItem: (id: string, enabled: boolean) => void;
  readonly onDeleteItem: (id: string) => void;
  readonly onMoveItem: (id: string, groupId: string, position: number) => void;
}) {
  const orderedGroups = [...groups].sort((left, right) => left.position - right.position);
  const catalog = useRef<HTMLDivElement>(null);
  useQuickAccessGuard(() => ({
    busy,
    dirty: [
      ...(catalog.current?.querySelectorAll<HTMLSelectElement>('.sleep-delete-group select') ?? []),
    ].some((select) => select.value !== ''),
  }));
  return (
    <div className="sleep-catalog" ref={catalog}>
      <div className="sleep-catalog-heading">
        <div>
          <h2>Повторяемый список</h2>
          <p>
            Новые пункты появятся и в текущей незавершённой подготовке. Остальные изменения — со
            следующей ночи.
          </p>
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
  readonly onSubmit: (value: string) => void | Promise<boolean>;
}) {
  const quickForm = useQuickAccessUncontrolledForm(busy);
  const submitting = useRef(false);
  return (
    <form
      className="sleep-quick-form"
      ref={quickForm}
      aria-label={label}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || submitting.current) return;
        const input = event.currentTarget.elements.namedItem('title');
        if (!(input instanceof HTMLInputElement) || !input.value.trim()) return;
        const entered = input.value;
        submitting.current = true;
        try {
          const saved = await onSubmit(entered.trim());
          if (saved !== false && value === undefined && input.value === entered) input.value = '';
        } finally {
          submitting.current = false;
        }
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

function formatPlannedSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const duration = `${hours} ч${remainder ? ` ${remainder} мин` : ''}`;
  return minutes === 24 * 60 ? `${duration} (время совпадает)` : duration;
}

function latestCycle(cycles: readonly NightCycle[]): NightCycle | null {
  return (
    [...cycles].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
    null
  );
}

async function observationForLatestCycle(
  service: SleepObservationService,
  state: SleepScheduleState,
): Promise<SleepObservation | null> {
  const cycle = latestCycle(state.nightCycles);
  if (cycle === null) return null;
  const history = await service.history(cycle.cycleDate, cycle.cycleDate);
  return history[0] ?? null;
}

async function observationHistoryForState(
  service: SleepObservationService,
  state: SleepScheduleState,
): Promise<readonly SleepObservation[]> {
  const cycle = latestCycle(state.nightCycles);
  if (cycle === null) return [];
  return service.history(addCycleDays(cycle.cycleDate, -29), cycle.cycleDate);
}

function addCycleDays(cycleDate: string, days: number): string {
  const value = new Date(`${cycleDate}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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

function formatCycleDate(cycleDate: string | undefined, timeZone: string): string {
  const date = cycleDate ? new Date(`${cycleDate}T12:00:00`) : new Date();
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
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
  | 'history'
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
      ) : kind === 'history' ? (
        <>
          <path d="M4 12a8 8 0 1 0 2.3-5.7" />
          <path d="M4 4v5h5M12 8v4l3 2" />
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
