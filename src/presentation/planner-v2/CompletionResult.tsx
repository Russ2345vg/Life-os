import { useRef, useState } from 'react';
import { useQuickAccessGuard } from './QuickAccessContext';
import type { LifeAction } from '../../domain';
import { usePlanning } from './PlanningContext';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';

/** One optional note belongs to one completion; no second reporting store. */
export function CompletionResult({ action }: { readonly action: LifeAction }) {
  const context = usePlanning();
  const current = context?.state?.actions.find((a) => a.id.equals(action.id)) ?? action;
  if (!context || current.status !== 'completed') return null;
  return (
    <ResultForm
      key={current.completionKey}
      action={current}
      onSave={async (text) => {
        await context.services.progress.saveResult(
          current.id.toString(),
          current.completionKey,
          text,
        );
        await context.refresh();
      }}
    />
  );
}

function ResultForm({
  action,
  onSave,
}: {
  readonly action: LifeAction;
  readonly onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(action.actualResult?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const working = useRef(false);
  useQuickAccessGuard(() => ({ dirty: text !== (action.actualResult?.toString() ?? ''), busy }));
  return (
    <details className="planner-details planner-completion-result">
      <summary>{action.actualResult ? 'Результат выполнения' : 'Добавить результат'}</summary>
      <form
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
        <p className="planner-muted">
          {action.completedOn} · Необязательно. Что сделано, какой результат получен, заметка или
          вывод.
        </p>
        <VoiceField>
          <span>Результат и заметка</span>
          <VoiceTextArea
            id={`completion-result-${action.id.toString()}`}
            value={text}
            onValueChange={setText}
            maxLength={2000}
            disabled={busy}
          />
        </VoiceField>
        <button disabled={busy || !text.trim()} type="submit">
          Сохранить результат
        </button>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Результат сохранён</p>}
      </form>
    </details>
  );
}
