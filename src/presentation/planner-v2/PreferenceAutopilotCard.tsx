import { useEffect, useRef, useState } from 'react';
import type {
  DayAutopilotService,
  DayAutopilotPreview,
  AutopilotSetup,
  AutopilotDaySchedule,
} from '../../application/planner/DayAutopilotService';
import { DayDate } from '../../domain';
import {
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
  type AutopilotPreferences,
  type AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import { autopilotLocalTime } from '../../application/planner/AutopilotConstraints';
import { AutopilotPreferencesForm } from './AutopilotPreferencesForm';
import { AutopilotPlanPreview, AutopilotTimeline } from './AutopilotPlanPreview';
import './autopilot-preferences.css';
export type DayAutopilotClient = Pick<
  DayAutopilotService,
  'getSetup' | 'savePreferences' | 'saveDraft' | 'readSchedule' | 'preview' | 'apply'
>;
export function PreferenceAutopilotCard({
  date,
  service,
  busy,
  onApplied,
}: {
  readonly date: DayDate;
  readonly service: DayAutopilotClient;
  readonly busy: boolean;
  readonly onApplied: () => Promise<void> | void;
}) {
  const [setup, setSetup] = useState<AutopilotSetup | null>(null);
  const [preferences, setPreferences] = useState<AutopilotPreferences | null>(null);
  const [draft, setDraft] = useState<AutopilotDayDraft | null>(null);
  const [preview, setPreview] = useState<DayAutopilotPreview | null>(null);
  const [applied, setApplied] = useState<AutopilotDaySchedule | null>(null);
  const [rebuild, setRebuild] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const dateKey = date.toString();
  useEffect(() => {
    const current = ++generation.current;
    void Promise.all([
      service.getSetup(DayDate.create(dateKey)),
      service.readSchedule(DayDate.create(dateKey), DayDate.create(dateKey)),
    ])
      .then(([value, schedule]) => {
        if (generation.current !== current) return;
        const local = autopilotLocalTime(new Date(), value.timeZone);
        setSetup(value);
        setApplied(schedule[0] ?? null);
        setPreferences(value.preferences.value);
        setDraft({
          ...value.draft.value,
          startMinute:
            value.draft.value.startMinute ??
            (local.date === dateKey ? Math.min(1435, Math.ceil(local.minute / 5) * 5) : 540),
        });
        setError(null);
      })
      .catch((reason: unknown) => {
        if (generation.current === current) setError(errorText(reason));
      });
    return () => {
      generation.current += 1;
    };
  }, [dateKey, service]);
  const disabled = busy || working;
  const build = async (editedDraft = draft) => {
    if (!setup || !preferences || !editedDraft || disabled) return;
    const current = generation.current;
    setWorking(true);
    setPreview(null);
    setError(null);
    setMessage(null);
    try {
      const validatedPrefs = validateAutopilotPreferences(preferences),
        validatedDraft = validateAutopilotDayDraft(editedDraft);
      const savedPrefs = await service.savePreferences(validatedPrefs, setup.preferences.version);
      if (generation.current !== current) return;
      setSetup((old) => (old ? { ...old, preferences: savedPrefs } : old));
      const savedDraft = await service.saveDraft(validatedDraft, setup.draft.version);
      if (generation.current !== current) return;
      setDraft(savedDraft.value);
      const fresh = await service.getSetup(DayDate.create(dateKey));
      if (generation.current !== current) return;
      setSetup(fresh);
      const next = await service.preview({
        date: DayDate.create(dateKey),
        mode: rebuild ? 'rebuild' : 'fill',
      });
      if (generation.current === current) setPreview(next);
    } catch (reason: unknown) {
      if (generation.current === current) setError(errorText(reason));
    } finally {
      if (generation.current === current) setWorking(false);
    }
  };
  const edit = (next: AutopilotDayDraft) => {
    setDraft(next);
    setPreview(null);
    void build(next);
  };
  const apply = async () => {
    if (!preview || disabled) return;
    const current = generation.current;
    setWorking(true);
    setError(null);
    try {
      const result = await service.apply(preview);
      if (generation.current !== current) return;
      setPreview(null);
      const schedule = await service.readSchedule(DayDate.create(dateKey), DayDate.create(dateKey));
      await onApplied();
      if (generation.current !== current) return;
      setApplied(schedule[0] ?? null);
      setRebuild(true);
      setMessage(
        `План применён: ${result.updatedCount} ${actionWord(result.updatedCount)}. Расписание сохранено.`,
      );
      const fresh = await service.getSetup(DayDate.create(dateKey));
      if (generation.current === current) setSetup(fresh);
    } catch (reason: unknown) {
      if (generation.current === current) {
        setPreview(null);
        setError(errorText(reason));
      }
    } finally {
      if (generation.current === current) setWorking(false);
    }
  };
  const reload = async () => {
    if (disabled) return;
    const current = ++generation.current;
    setWorking(true);
    try {
      const [value, schedule] = await Promise.all([
        service.getSetup(DayDate.create(dateKey)),
        service.readSchedule(DayDate.create(dateKey), DayDate.create(dateKey)),
      ]);
      if (generation.current !== current) return;
      setSetup(value);
      setPreferences(value.preferences.value);
      setDraft(value.draft.value);
      setApplied(schedule[0] ?? null);
      setError(null);
      setPreview(null);
    } catch (reason: unknown) {
      if (generation.current === current) setError(errorText(reason));
    } finally {
      if (generation.current === current) setWorking(false);
    }
  };
  return (
    <section className="planner-day-autopilot" aria-label="Автопилот дня">
      <details className="planner-day-autopilot__disclosure" open>
        <summary className="planner-day-autopilot__header">
          <div>
            <span className="planner-eyebrow">Умное планирование</span>
            <h3 id="day-autopilot-title">Автопилот дня</h3>
            <p>Подберёт дела под твой фокус и пожелания, оставит время на распорядок и отдых.</p>
          </div>
          <span className="planner-day-autopilot__mark" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div className="planner-day-autopilot__body">
          {setup && preferences && draft ? (
            <AutopilotPreferencesForm
              setup={setup}
              preferences={preferences}
              draft={draft}
              busy={disabled}
              rebuild={rebuild}
              onPreferences={(value) => {
                setPreferences(value);
                setPreview(null);
                setMessage(null);
              }}
              onDraft={(value) => {
                setDraft(value);
                setPreview(null);
                setMessage(null);
              }}
              onRebuild={(value) => {
                setRebuild(value);
                setPreview(null);
              }}
              onBuild={() => void build()}
            />
          ) : !error ? (
            <p role="status">Загружаю предпочтения…</p>
          ) : null}
          {preview && (
            <>
              <AutopilotPlanPreview
                preview={preview}
                busy={disabled}
                onDuration={(actionId, minutes) =>
                  draft &&
                  edit({
                    ...draft,
                    durationOverrides: [
                      ...draft.durationOverrides.filter((item) => item.actionId !== actionId),
                      { actionId, minutes },
                    ],
                  })
                }
                onExclude={(actionId) =>
                  draft &&
                  edit({
                    ...draft,
                    excludedActionIds: [...new Set([...draft.excludedActionIds, actionId])],
                  })
                }
              />
              <div className="planner-day-autopilot__actions">
                <button
                  type="button"
                  className="planner-primary"
                  disabled={disabled || !hasChanges(preview)}
                  onClick={() => void apply()}
                >
                  Применить план
                </button>
                <button type="button" disabled={disabled} onClick={() => setPreview(null)}>
                  Отменить
                </button>
              </div>
            </>
          )}
          <div aria-live="polite">
            {message && <p className="planner-success">{message}</p>}
            {error && (
              <p role="alert" className="planner-error">
                {error}
              </p>
            )}
          </div>
          {error && (
            <button type="button" disabled={disabled} onClick={() => void reload()}>
              Загрузить сохранённые настройки
            </button>
          )}
          {applied && applied.blocks.length > 0 && !preview && (
            <div className="planner-day-autopilot__preview">
              <h4>Сохранённое расписание</h4>
              <AutopilotTimeline
                blocks={applied.blocks}
                proposals={[]}
                date={applied.date}
                name="Сохранённое расписание"
                busy={disabled}
              />
              <p className="planner-muted">
                В расписании {applied.blocks.filter((block) => block.kind !== 'sleep').length}{' '}
                блоков. <a href="#/v2/actions?view=calendar">Открыть календарь →</a>
              </p>
            </div>
          )}
          {draft?.excludedActionIds.length ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft({ ...draft, excludedActionIds: [] });
                setPreview(null);
              }}
            >
              Вернуть исключённые дела ({draft.excludedActionIds.length})
            </button>
          ) : null}
        </div>
      </details>
    </section>
  );
}
function hasChanges(preview: DayAutopilotPreview): boolean {
  return (
    preview.proposals.length > 0 ||
    (preview.mode === 'rebuild' && (preview.affectedRoutineBlocks?.length ?? 0) > 0) ||
    preview.timeline?.some(
      (block) => !block.protected && !block.actionId && ['walk', 'rest'].includes(block.kind),
    ) === true ||
    preview.deferred.some((item) => preview.mode === 'rebuild' && item.hadScheduledWindow)
  );
}
function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Не удалось сохранить план. Повторите попытку.';
}
function actionWord(count: number): string {
  return count % 100 >= 11 && count % 100 <= 14
    ? 'задач'
    : count % 10 === 1
      ? 'задача'
      : count % 10 >= 2 && count % 10 <= 4
        ? 'задачи'
        : 'задач';
}
