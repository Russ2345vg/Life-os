import { CompletionResult } from './CompletionResult';
import { useQuickAccessDraft, useQuickAccessGuard } from './QuickAccessContext';
import { RecurrenceBadge } from './RecurrenceBadge';
import { useRef, useState } from 'react';
import type { LifeAction } from '../../domain';
import type { RecurrenceInput } from '../../application/planner/RecurringActions';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import { usePlanning } from './PlanningContext';
import { defaultRecurrence, RecurrenceFields } from './RecurrenceFields';
export function PlanningActionDetails({
  action,
  today,
}: {
  readonly action: LifeAction;
  readonly today: string;
}) {
  const c = usePlanning();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [goalId, setGoalId] = useState(''),
    [mode, setMode] = useState<'fixed' | 'actual'>('fixed'),
    [amount, setAmount] = useState('1'),
    [pauseUntil, setPauseUntil] = useState('');
  const working = useRef(false);
  const storedRule = c?.state?.rules.find((r) => r.id === action.occurrence?.ruleId);
  const rule = storedRule?.removedAt == null ? storedRule : undefined;
  const [draft, setDraft] = useState<RecurrenceInput>(
    () =>
      rule ?? defaultRecurrence(action.title.toString(), today, action.goalId?.toString() ?? null),
  );
  const [preview, setPreview] = useState<{
    fingerprint: string;
    linkId: string;
    current: number;
    added: number;
    candidates: readonly ProgressContribution[];
  } | null>(null);
  const recurrenceSaved = useQuickAccessDraft(draft, busy);
  const linkSaved = useQuickAccessDraft({ goalId, mode, amount }, busy);
  useQuickAccessGuard(() => ({ dirty: pauseUntil !== '', busy }));
  if (!c?.state) return null;
  const s = c.state;
  const run = async (work: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await c.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const sourceType = storedRule ? 'rule' : 'action',
    sourceId = storedRule?.id ?? action.id.toString();
  const links = s.links.filter(
    (l) => l.sourceType === sourceType && l.sourceId === sourceId && !l.removed,
  );
  const facts = s.contributions.filter(
    (p) =>
      p.actionId === action.id.toString() &&
      contributionIsEffective(p, new Map([[action.id.toString(), action]])),
  );
  const completions = storedRule
    ? new Set(
        s.actions
          .filter(
            (item) => item.occurrence?.ruleId === storedRule.id && item.status === 'completed',
          )
          .map((item) => item.completionKey),
      ).size
    : 0;
  return (
    <>
      <CompletionResult action={action} />
      {storedRule && (
        <section className="planner-recurrence-summary" aria-label="Повторение">
          <p>
            <RecurrenceBadge rule={storedRule} />
          </p>
          {storedRule.removedAt != null && <p>Серия удалена. Выполненная история сохранена.</p>}
          {storedRule.maxCompletions !== null && (
            <p>
              Цель: {storedRule.maxCompletions} выполнений · {completions} /{' '}
              {storedRule.maxCompletions}
            </p>
          )}
        </section>
      )}
      {action.status === 'completed' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void run(() => c.services.progress.reopen(action.id.toString()));
          }}
        >
          Вернуть в работу
        </button>
      )}
      <div className="planning-pending">
        {facts
          .filter((f) => f.amount === null)
          .map((f) => (
            <ActualValue
              key={f.id}
              fact={f}
              title={s.goals.find((g) => g.id.toString() === f.goalId)?.title ?? 'Результат'}
              busy={busy}
              onSave={(value) => run(() => c.services.progress.setActual(f.id, value))}
            />
          ))}
      </div>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Повторение и вклад в цели</summary>
        {open && (
          <fieldset disabled={busy}>
            <p className="planner-muted">
              Связь с целью сама по себе не добавляет прогресс. Вклад настраивается явно.
            </p>
            {facts
              .filter((f) => f.amount !== null)
              .map((f) => (
                <ActualValue
                  key={f.id}
                  fact={f}
                  title={s.goals.find((g) => g.id.toString() === f.goalId)?.title ?? 'Результат'}
                  busy={busy}
                  onSave={(value) => run(() => c.services.progress.setActual(f.id, value))}
                />
              ))}
            {storedRule?.removedAt == null && (
              <details>
                <summary>{rule ? 'Изменить будущие повторения' : 'Сделать повторяющимся'}</summary>
                <RecurrenceFields value={draft} onChange={setDraft} />
                <button
                  onClick={() => {
                    void run(async () => {
                      await c.services.recurrence.save(
                        draft,
                        rule?.id,
                        rule ? undefined : action.id.toString(),
                      );
                      recurrenceSaved();
                    });
                  }}
                >
                  Сохранить расписание
                </button>
                {rule && (
                  <>
                    <label>
                      Пауза до · необязательно
                      <input
                        type="date"
                        value={pauseUntil}
                        onChange={(e) => setPauseUntil(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() => {
                        void run(async () => {
                          await (rule.paused
                            ? c.services.recurrence.resume(rule.id)
                            : c.services.recurrence.pause(rule.id, pauseUntil || null));
                          setPauseUntil('');
                        });
                      }}
                    >
                      {rule.paused ? 'Возобновить' : 'Приостановить'}
                    </button>
                    {rule.schedule.kind !== 'count' &&
                      !['completed', 'cancelled', 'archived'].includes(action.status) && (
                        <button
                          onClick={() => {
                            void run(() => c.services.recurrence.skip(action.id.toString()));
                          }}
                        >
                          Пропустить это повторение
                        </button>
                      )}
                  </>
                )}
              </details>
            )}
            <label>
              Цель для вклада
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">Выберите измеримую цель</option>
                {s.goals
                  .filter((g) => g.measurement && g.status !== 'archived')
                  .map((g) => (
                    <option key={g.id.toString()} value={g.id.toString()}>
                      {g.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Как учитывать
              <select value={mode} onChange={(e) => setMode(e.target.value as 'fixed' | 'actual')}>
                <option value="fixed">Фиксированный вклад</option>
                <option value="actual">Фактический результат при выполнении</option>
              </select>
            </label>
            {mode === 'fixed' && (
              <label>
                Величина вклада
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            <button
              disabled={!goalId || !amount}
              onClick={() => {
                void run(async () => {
                  await c.services.progress.setLink(
                    sourceType,
                    sourceId,
                    goalId,
                    mode,
                    Number(amount),
                  );
                  linkSaved();
                });
              }}
            >
              Добавить / обновить связь
            </button>
            {links.map((l) => (
              <div className="planning-contribution" key={l.id}>
                <p>
                  {s.goals.find((g) => g.id.toString() === l.goalId)?.title} ·{' '}
                  {l.mode === 'fixed' ? l.amount : 'По факту'}
                </p>
                <button
                  onClick={() => {
                    void run(() =>
                      c.services.progress.setLink(
                        sourceType,
                        sourceId,
                        l.goalId,
                        l.mode,
                        l.amount,
                        true,
                      ),
                    );
                  }}
                >
                  Убрать связь
                </button>
                <button
                  onClick={() => {
                    void run(async () => {
                      const p = await c.services.progress.previewBackfill(l.id);
                      setPreview({ ...p, linkId: l.id });
                    });
                  }}
                >
                  Рассчитать прошлые выполнения
                </button>
              </div>
            ))}
            {preview && (
              <div role="status">
                <p>
                  Прошлых выполнений: {preview.candidates.length}. Сейчас: {preview.current}.
                  Добавится: {preview.added}
                  {preview.candidates.some((v) => v.amount === null)
                    ? ' · значения по факту ожидаются'
                    : ''}
                  .
                </p>
                <button
                  disabled={!preview.candidates.length}
                  onClick={() => {
                    void run(async () => {
                      await c.services.progress.applyBackfill(
                        preview.linkId,
                        preview.candidates.map((v) => v.id),
                        preview.fingerprint,
                      );
                      setPreview(null);
                    });
                  }}
                >
                  Подтвердить учёт
                </button>
                <button onClick={() => setPreview(null)}>Отмена</button>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </fieldset>
        )}
      </details>
    </>
  );
}
function ActualValue({
  fact,
  title,
  busy,
  onSave,
}: {
  readonly fact: ProgressContribution;
  readonly title: string;
  readonly busy: boolean;
  readonly onSave: (amount: number) => Promise<void>;
}) {
  const [value, setValue] = useState(fact.amount?.toString() ?? ''),
    [later, setLater] = useState(false);
  useQuickAccessGuard(() => ({ busy, dirty: value !== (fact.amount?.toString() ?? '') }));
  return (
    <div className="planning-contribution">
      <p>
        {title} · {fact.amount === null ? 'Ожидает значения' : `Учтено: ${fact.amount}`}
      </p>
      {!later && (
        <>
          <label>
            Фактический результат
            <input
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !value}
            onClick={() => {
              void onSave(Number(value));
            }}
          >
            Сохранить результат
          </button>
        </>
      )}
      {fact.amount === null && (
        <button onClick={() => setLater(!later)}>
          {later ? 'Указать результат' : 'Указать позже'}
        </button>
      )}
    </div>
  );
}
