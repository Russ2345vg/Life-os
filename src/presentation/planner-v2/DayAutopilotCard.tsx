import { useState } from 'react';
import type { DayAutopilotPreview, DayAutopilotService } from '../../application';
import type { DayDate } from '../../domain';
import { clockTime, durationLabel } from './timePresentation';
import { PreferenceAutopilotCard, type DayAutopilotClient } from './PreferenceAutopilotCard';

export function DayAutopilotCard(props: {
  readonly date: DayDate;
  readonly service: Pick<DayAutopilotService, 'preview' | 'apply'> & Partial<DayAutopilotClient>;
  readonly busy: boolean;
  readonly onApplied: () => Promise<void> | void;
}) {
  return props.service.getSetup &&
    props.service.readSchedule &&
    props.service.savePreferences &&
    props.service.saveDraft ? (
    <PreferenceAutopilotCard
      {...props}
      key={props.date.toString()}
      service={props.service as DayAutopilotClient}
    />
  ) : (
    <LegacyDayAutopilotCard {...props} />
  );
}

function LegacyDayAutopilotCard({
  date,
  service,
  busy,
  onApplied,
}: {
  readonly date: DayDate;
  readonly service: Pick<DayAutopilotService, 'preview' | 'apply'>;
  readonly busy: boolean;
  readonly onApplied: () => Promise<void> | void;
}) {
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [rebuild, setRebuild] = useState(false);
  const [preview, setPreview] = useState<DayAutopilotPreview | null>(null);
  const [working, setWorking] = useState<'preview' | 'apply' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || working !== null;

  const build = async () => {
    setWorking('preview');
    setError(null);
    setMessage(null);
    try {
      const next = await service.preview({
        date,
        mode: rebuild ? 'rebuild' : 'fill',
        startMinute: parseClockTime(startTime),
      });
      setStartTime(formatInputTime(next.startMinute));
      setPreview(next);
    } catch (reason: unknown) {
      setPreview(null);
      setError(errorMessage(reason, 'Не удалось собрать план дня.'));
    } finally {
      setWorking(null);
    }
  };

  const apply = async () => {
    if (preview === null || !previewHasChanges(preview)) return;
    setWorking('apply');
    setError(null);
    try {
      const result = await service.apply(preview);
      await onApplied();
      setPreview(null);
      setRebuild(true);
      setStartTime(defaultStartTime());
      setMessage(`План применён: ${result.updatedCount} ${actionWord(result.updatedCount)}.`);
    } catch (reason: unknown) {
      setError(errorMessage(reason, 'Не удалось применить план. Соберите его ещё раз.'));
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="planner-day-autopilot" aria-labelledby="day-autopilot-title">
      <details className="planner-day-autopilot__disclosure">
        <summary className="planner-day-autopilot__header">
          <div>
            <span className="planner-eyebrow">Умное планирование</span>
            <h3 id="day-autopilot-title">Автопилот дня</h3>
            <p>
              Расставит задачи по времени, сохранит резерв и покажет, что сегодня не помещается.
            </p>
          </div>
          <span className="planner-day-autopilot__mark" aria-hidden="true">
            ⌄
          </span>
        </summary>

        <div className="planner-day-autopilot__body">
          <div className="planner-day-autopilot__controls">
            <label>
              Начать с
              <input
                type="time"
                step={300}
                value={startTime}
                disabled={disabled}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label className="planner-day-autopilot__toggle">
              <input
                type="checkbox"
                checked={rebuild}
                disabled={disabled}
                onChange={(event) => {
                  setRebuild(event.target.checked);
                  setPreview(null);
                }}
              />
              <span>Пересобрать будущие блоки</span>
            </label>
            <button className="planner-primary" type="button" disabled={disabled} onClick={build}>
              {working === 'preview' ? 'Собираю…' : 'Собрать мой день'}
            </button>
          </div>

          {preview ? <DayAutopilotPreviewPanel preview={preview} /> : null}
          {preview ? (
            <div className="planner-day-autopilot__actions">
              <button
                className="planner-primary"
                type="button"
                disabled={disabled || !previewHasChanges(preview)}
                onClick={apply}
              >
                {working === 'apply' ? 'Применяю…' : 'Применить план'}
              </button>
              <button type="button" disabled={disabled} onClick={() => setPreview(null)}>
                Отменить
              </button>
            </div>
          ) : null}
          <div className="planner-day-autopilot__status" aria-live="polite">
            {message ? <p className="planner-success">{message}</p> : null}
            {error ? (
              <p className="planner-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}

export function DayAutopilotPreviewPanel({ preview }: { readonly preview: DayAutopilotPreview }) {
  return (
    <div className="planner-day-autopilot__preview">
      <div className="planner-day-autopilot__summary">
        <div>
          <span>В фокусе</span>
          <strong>{durationLabel(preview.plannedMinutes)}</strong>
        </div>
        <div>
          <span>Резерв</span>
          <strong>{durationLabel(preview.reserveMinutes)}</strong>
        </div>
        <div>
          <span>До</span>
          <strong>{clockTime(preview.endMinute)}</strong>
        </div>
      </div>

      {preview.recoverySignal ? (
        <p className="planner-day-autopilot__note">
          Резерв после короткой ночи: в постели {durationLabel(preview.recoverySignal.minutes)}.
          Темп снижен автоматически.
        </p>
      ) : null}
      {preview.capacityAssumed ? (
        <p className="planner-day-autopilot__note">
          Доступное время не настроено — использовано допущение 8 часов.
        </p>
      ) : null}

      {preview.proposals.length ? (
        <ol className="planner-day-autopilot__timeline" aria-label="Предложенные блоки">
          {preview.proposals.map((proposal) => (
            <li key={proposal.actionId}>
              <time>
                {clockTime(proposal.startMinute)}–
                {clockTime(proposal.startMinute + proposal.durationMinutes)}
              </time>
              <span className="planner-day-autopilot__line" aria-hidden="true" />
              <div>
                <strong>{proposal.title}</strong>
                <span>
                  {proposal.isMain ? <b>Главное</b> : reasonLabel(proposal.reason)}
                  {' · '}
                  {durationLabel(proposal.durationMinutes)}
                  {proposal.usedDefaultEstimate ? ' · Оценка 25 минут' : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="planner-empty">Свободных задач для автоплана пока нет.</p>
      )}

      {preview.locked.length ? (
        <details className="planner-day-autopilot__details">
          <summary>Сохранено без изменений: {preview.locked.length}</summary>
          <ul>
            {preview.locked.map((item) => (
              <li key={item.actionId}>
                <span>{item.title}</span>
                <span>
                  {clockTime(item.startMinute)}–{clockTime(item.startMinute + item.durationMinutes)}{' '}
                  · {lockedReasonLabel(item.reason)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {preview.deferred.length ? (
        <div className="planner-day-autopilot__deferred">
          <h4>Не поместилось</h4>
          <ul>
            {preview.deferred.map((item) => (
              <li key={item.actionId}>
                <span>{item.title}</span>
                <span>
                  {item.reason === 'active_session'
                    ? 'Уже выполняется — время защищено'
                    : item.hadScheduledWindow
                      ? `Будет убрано из временной сетки · нужно ${durationLabel(item.requestedMinutes)}`
                      : `Нужно ещё ${durationLabel(item.requestedMinutes)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function defaultStartTime(): string {
  const now = new Date();
  const rounded = Math.min(
    23 * 60 + 55,
    Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5,
  );
  return formatInputTime(rounded);
}

function formatInputTime(value: number): string {
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function parseClockTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function previewHasChanges(preview: DayAutopilotPreview): boolean {
  return (
    preview.proposals.length > 0 ||
    preview.deferred.some(
      (item) =>
        preview.mode === 'rebuild' && item.reason === 'no_capacity' && item.hadScheduledWindow,
    )
  );
}

function actionWord(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'задач';
  if (count % 10 === 1) return 'задача';
  if (count % 10 >= 2 && count % 10 <= 4) return 'задачи';
  return 'задач';
}

function reasonLabel(reason: DayAutopilotPreview['proposals'][number]['reason']): string {
  if (reason === 'priority') return 'Высокий приоритет';
  return 'По порядку дня';
}

function lockedReasonLabel(reason: DayAutopilotPreview['locked'][number]['reason']): string {
  if (reason === 'active_session') return 'идёт работа';
  if (reason === 'past_window') return 'прошедший блок';
  return 'заданное время';
}
