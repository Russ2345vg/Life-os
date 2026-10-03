import { useRef, useState } from 'react';
import { useQuickAccess, useQuickAccessGuard } from './QuickAccessContext';
import type { LifeAction } from '../../domain';
import { usePlanning } from './PlanningContext';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { PlannerSheet } from './PlannerSheet';
import { PlannerUnsavedChangesConfirmation } from './PlannerUnsavedChangesConfirmation';

export interface CompletionSummaryTarget {
  readonly actionId: string;
  readonly completionKey: string;
  readonly title: string;
  readonly completedOn: string | null;
  readonly text: string;
}

// Capture the successful completion, never retarget an open draft after refresh/reopen.
// eslint-disable-next-line react-refresh/only-export-components
export function completionSummaryTarget(action: LifeAction): CompletionSummaryTarget | null {
  if (action.status !== 'completed') return null;
  return {
    actionId: action.id.toString(),
    completionKey: action.completionKey,
    title: action.title.toString(),
    completedOn: action.completedOn,
    text: action.actualResult?.toString() ?? '',
  };
}

export function CompletionResultPrompt({
  target,
  onClose,
  onSaved,
  guardScope = 'completion-summary',
}: {
  readonly target: CompletionSummaryTarget;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
  readonly guardScope?: string;
}) {
  const context = usePlanning();
  const quick = useQuickAccess();
  const [confirm, setConfirm] = useState(false);
  const [busyMessage, setBusyMessage] = useState(false);
  if (!context) return null;
  const requestClose = () => {
    if (confirm) {
      setConfirm(false);
      return;
    }
    const state = quick?.inspect(guardScope);
    if (state?.busy) {
      setBusyMessage(true);
      return;
    }
    if (state?.dirty) {
      setConfirm(true);
      return;
    }
    onClose();
  };
  return (
    <PlannerSheet title="Итог задачи" onClose={requestClose}>
      <ResultForm
        target={target}
        prompt
        onSkip={onClose}
        onSave={async (text) => {
          await context.services.progress.saveResult(target.actionId, target.completionKey, text);
          await context.refresh();
          onSaved?.();
          onClose();
        }}
      />
      {busyMessage && <p role="status">Дождитесь завершения сохранения.</p>}
      {confirm && (
        <PlannerUnsavedChangesConfirmation
          onContinue={() => setConfirm(false)}
          onDiscard={onClose}
        />
      )}
    </PlannerSheet>
  );
}

/** One optional note belongs to one completion; no second reporting store. */
export function CompletionResult({ action }: { readonly action: LifeAction }) {
  const context = usePlanning();
  const current = context?.state?.actions.find((a) => a.id.equals(action.id)) ?? action;
  const target = completionSummaryTarget(current);
  if (!context || !target) return null;
  return (
    <details className="planner-details planner-completion-result">
      <summary>{current.actualResult ? 'Итог задачи' : 'Добавить итог'}</summary>
      <ResultForm
        key={current.completionKey}
        target={target}
        onSave={async (text) => {
          await context.services.progress.saveResult(
            current.id.toString(),
            current.completionKey,
            text,
          );
          await context.refresh();
        }}
      />
    </details>
  );
}

function ResultForm({
  target,
  onSave,
  prompt = false,
  onSkip,
}: {
  readonly target: CompletionSummaryTarget;
  readonly onSave: (text: string) => Promise<void>;
  readonly prompt?: boolean;
  readonly onSkip?: () => void;
}) {
  const [text, setText] = useState(target.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const working = useRef(false);
  useQuickAccessGuard(() => ({ dirty: text !== target.text, busy }));
  return (
    <form
      className={prompt ? 'planner-form' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (working.current || !text.trim()) return;
        working.current = true;
        setBusy(true);
        setError(null);
        setSaved(false);
        void onSave(text)
          .then(() => setSaved(true))
          .catch((e: unknown) =>
            setError(e instanceof Error ? e.message : 'Не удалось сохранить. Повторите попытку.'),
          )
          .finally(() => {
            working.current = false;
            setBusy(false);
          });
      }}
    >
      {prompt && (
        <header>
          <p className="planner-eyebrow">Выполнено</p>
          <h1>Итог задачи</h1>
          <p className="planner-muted">{target.title}</p>
        </header>
      )}
      <p className="planner-muted">
        {target.completedOn} · Необязательно. Что сделано, какой результат получен, заметка или
        вывод.
      </p>
      <VoiceField>
        <span>Итог задачи</span>
        <VoiceTextArea
          id={`${prompt ? 'completion-summary' : 'completion-result'}-${target.actionId}`}
          value={text}
          onValueChange={setText}
          maxLength={2000}
          disabled={busy}
          rows={5}
        />
      </VoiceField>
      <footer className="planner-form-actions">
        <button className="planner-primary" disabled={busy || !text.trim()} type="submit">
          {busy ? 'Сохраняем…' : 'Сохранить итог'}
        </button>
        {onSkip && (
          <button disabled={busy} type="button" onClick={onSkip}>
            Пропустить
          </button>
        )}
      </footer>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Итог сохранён</p>}
    </form>
  );
}
