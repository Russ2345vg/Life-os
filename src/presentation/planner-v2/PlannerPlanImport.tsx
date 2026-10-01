import { useRef, useState } from 'react';
import type { PlanImport, PlanImportResult } from '../../application/plan-import/PlanImport';
import { MAX_PLAN_FILE_BYTES, type PlanFile } from '../../application/plan-import/PlanFile';
import { PlannerSheet } from './PlannerSheet';
import { useQuickAccessGuard } from './QuickAccessContext';
import './planner-plan-import.css';

const displayDate = (value: string) => value.split('-').reverse().join('.');

export function PlannerPlanImport({
  service,
  onClose,
  onImported,
}: {
  readonly service: Pick<PlanImport, 'preview' | 'execute'>;
  readonly onClose: () => void;
  readonly onImported: () => void;
}) {
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<PlanFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const busy = reading || saving;
  useQuickAccessGuard(() => ({ dirty: false, busy }));
  const close = () => {
    if (!inFlight.current) {
      sequence.current += 1;
      onClose();
    }
  };
  const selectFile = async (file: File | undefined) => {
    const current = ++sequence.current;
    setSource('');
    setPreview(null);
    setError(null);
    setResult(null);
    if (!file) {
      setReading(false);
      return;
    }
    setReading(true);
    try {
      if (file.size > MAX_PLAN_FILE_BYTES)
        throw new Error('Файл слишком большой. Максимум — 1 МБ.');
      const text = await file.text();
      if (sequence.current !== current) return;
      const plan = service.preview(text);
      setSource(text);
      setPreview(plan);
    } catch (reason: unknown) {
      if (sequence.current === current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Не удалось прочитать файл. Выберите его ещё раз.',
        );
    } finally {
      if (sequence.current === current) setReading(false);
    }
  };
  const submit = async () => {
    if (inFlight.current || !preview) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const saved = await service.execute(source);
      setResult(saved);
      if (saved.error) setError(saved.error);
      onImported();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось добавить план. Повторите попытку.',
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const complete = result !== null && result.error === null;
  const createdTotal = result
    ? Object.values(result.created).reduce((sum, value) => sum + value, 0)
    : 0;
  return (
    <PlannerSheet title="Импорт плана" onClose={close} lockScroll>
      <div className="planner-form planner-plan-import" aria-busy={busy}>
        <header>
          <p className="planner-eyebrow">Цели и действия</p>
          <h1>Импорт плана</h1>
          <p className="planner-muted">
            Выберите файл, проверьте цели и даты, затем добавьте план.
          </p>
        </header>
        <label>
          Файл плана
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <small className="planner-muted">
            Файл LifeOS (.json), до 1 МБ. До подтверждения данные не меняются.
          </small>
        </label>
        {reading && <p role="status">Проверяем файл…</p>}
        {error && (
          <div role="alert" className="planner-error">
            <p>{error}</p>
            {result && (
              <p>Добавленные записи сохранены. Повторите импорт, чтобы продолжить без дублей.</p>
            )}
          </div>
        )}
        {result && (
          <section className="planner-import-result" role="status">
            <strong>
              {result.error
                ? 'Импорт остановлен'
                : createdTotal
                  ? 'План добавлен'
                  : 'Уже добавлено ранее'}
            </strong>
            <p>
              Добавлено — сфер: {result.created.spheres}; направлений: {result.created.directions}.
              Целей: {result.created.goals}; действий: {result.created.actions}.
            </p>
            <p>
              Пропущено существующих записей:{' '}
              {Object.values(result.skipped).reduce((sum, value) => sum + value, 0)}.
            </p>
          </section>
        )}
        {preview && (
          <section aria-label="Предварительный просмотр плана" className="planner-import-preview">
            <header>
              <h2>{preview.title}</h2>
              <p className="planner-muted">
                {displayDate(preview.startDate)} — {displayDate(preview.endDate)}
              </p>
            </header>
            <p>
              {preview.directions.length} направлений · {preview.goals.length} целей ·{' '}
              {preview.actions.length} действий
            </p>
            <p className="planner-muted">
              Существующие записи сохранятся. Повторная загрузка этого плана не создаст дубли. Даты
              действий — дни выполнения; расписание можно изменить после импорта.
            </p>
            {preview.directions.map((direction) => (
              <section key={direction.key} className="planner-import-direction">
                <p className="planner-eyebrow">
                  {preview.spheres.find((sphere) => sphere.key === direction.sphereKey)?.name}
                </p>
                <h3>{direction.name}</h3>
                {preview.goals
                  .filter((goal) => goal.directionKey === direction.key)
                  .map((goal) => (
                    <details key={goal.key} className="planner-details">
                      <summary>
                        <span>{goal.title}</span>
                        <time dateTime={goal.dueDate}>{displayDate(goal.dueDate)}</time>
                      </summary>
                      {goal.outcome && <p>{goal.outcome}</p>}
                      {goal.description && <p className="planner-muted">{goal.description}</p>}
                      <ul>
                        {preview.actions
                          .filter((action) => action.goalKey === goal.key)
                          .map((action) => (
                            <li key={action.key}>
                              <span>{action.title}</span>
                              <small className="planner-muted">
                                {action.date ? displayDate(action.date) : 'Без даты'}
                              </small>
                            </li>
                          ))}
                      </ul>
                    </details>
                  ))}
              </section>
            ))}
          </section>
        )}
        <footer className="planner-form-actions">
          <button type="button" disabled={busy} onClick={close}>
            {complete ? 'Готово' : 'Отмена'}
          </button>
          {preview && !complete && (
            <button
              type="button"
              className="planner-primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {saving ? 'Добавляем…' : result ? 'Продолжить импорт' : 'Добавить план'}
            </button>
          )}
        </footer>
      </div>
    </PlannerSheet>
  );
}
