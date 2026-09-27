import { useRef, useState, type ReactNode } from 'react';
import { useQuickAccessGuard } from '../QuickAccessContext';
import type { BalanceImportance } from '../../../domain/balance/BalanceImportance';
import { balanceImportanceLabels } from './BalanceLabels';
export function ImportanceField({
  value,
  onChange,
}: {
  readonly value: BalanceImportance;
  readonly onChange: (v: BalanceImportance) => void;
}) {
  return (
    <label>
      <span>Важность</span>
      <select value={value} onChange={(e) => onChange(e.target.value as BalanceImportance)}>
        {Object.entries(balanceImportanceLabels).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ScoreField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max="10"
        step="0.1"
        value={value}
        placeholder="Не задано"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function BalanceForm({
  title,
  children,
  onSave,
  onCancel,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onSave: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  useQuickAccessGuard(() => ({ dirty: false, busy }));
  return (
    <form
      className="planner-form balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (working.current) return;
        working.current = true;
        setBusy(true);
        setError(null);
        void onSave()
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось сохранить.'))
          .finally(() => {
            working.current = false;
            setBusy(false);
          });
      }}
    >
      <h2>{title}</h2>
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {children}
        <div className="balance-actions">
          <button className="planner-primary" type="submit">
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </fieldset>
    </form>
  );
}
