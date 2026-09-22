import { useRef, useState } from 'react';
import type { InboxIdea } from '../../domain/planner/InboxIdea';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';

export function PlannerInbox({
  ideas,
  busy,
  onCapture,
  onConvert,
  onArchive,
}: {
  readonly ideas: readonly InboxIdea[];
  readonly busy: boolean;
  readonly onCapture: (title: string, note: string) => Promise<void>;
  readonly onConvert: (id: string, type: 'goal' | 'action') => void;
  readonly onArchive: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const inbox = ideas.filter((i) => i.status === 'inbox');
  const history = ideas.filter((i) => i.status !== 'inbox');
  return (
    <section className="planner-inbox">
      <header className="planner-page-heading">
        <div>
          <h1>Входящие</h1>
          <p className="planner-muted">Сохраните мысль. Разобраться можно позже.</p>
        </div>
      </header>
      <form
        className="planner-form planner-capture"
        onSubmit={(e) => {
          e.preventDefault();
          if (saving.current) return;
          saving.current = true;
          setPending(true);
          setError(null);
          void onCapture(title, note)
            .then(() => {
              setTitle('');
              setNote('');
            })
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'Не удалось сохранить мысль.'),
            )
            .finally(() => {
              saving.current = false;
              setPending(false);
            });
        }}
      >
        <fieldset disabled={pending || busy}>
          <VoiceField>
            <span>Новая мысль</span>
            <VoiceTextInput
              id="inbox-title"
              value={title}
              onValueChange={setTitle}
              placeholder="Что хочется запомнить?"
              required
              maxLength={200}
            />
          </VoiceField>
          <details className="planner-details">
            <summary>Добавить заметку</summary>
            <VoiceField>
              <span>Заметка</span>
              <VoiceTextArea
                id="inbox-note"
                value={note}
                onValueChange={setNote}
                rows={3}
                maxLength={4000}
              />
            </VoiceField>
          </details>
        </fieldset>
        {error && (
          <p role="alert" className="planner-error">
            {error}
          </p>
        )}
        <div className="planner-form-actions">
          <button type="submit" className="planner-primary" disabled={pending || busy}>
            {pending ? 'Сохраняем…' : 'Сохранить мысль'}
          </button>
        </div>
      </form>
      <h2>
        Не разобрано <span>{inbox.length}</span>
      </h2>
      {inbox.length === 0 && (
        <p className="planner-empty">Всё разобрано. Новую мысль можно записать выше.</p>
      )}
      <ul className="planner-list">
        {inbox.map((idea) => (
          <li className="planner-catalog-row" key={idea.id}>
            <button
              className="planner-row-title"
              type="button"
              aria-expanded={selected === idea.id}
              onClick={() => setSelected(selected === idea.id ? null : idea.id)}
            >
              {idea.title}
            </button>
            {idea.note && <p className="planner-action-note">{idea.note}</p>}
            {selected === idea.id && (
              <div className="planner-inline-actions">
                <button type="button" disabled={busy} onClick={() => onConvert(idea.id, 'goal')}>
                  Превратить в цель
                </button>
                <button type="button" disabled={busy} onClick={() => onConvert(idea.id, 'action')}>
                  Превратить в действие
                </button>
                <button type="button" onClick={() => setSelected(null)}>
                  Оставить во входящих
                </button>
                <button type="button" disabled={busy} onClick={() => onArchive(idea.id)}>
                  Архивировать
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {history.length > 0 && (
        <details className="planner-details">
          <summary>
            Разобранные и архив <span>{history.length}</span>
          </summary>
          <ul className="planner-list">
            {history.map((i) => (
              <li className="planner-catalog-row" key={i.id}>
                <span>{i.title}</span>
                <p className="planner-muted">
                  {i.status === 'archived'
                    ? 'В архиве'
                    : i.targetType === 'goal'
                      ? 'Преобразована в цель'
                      : 'Преобразована в действие'}
                </p>
                {i.targetId && (
                  <a
                    className="planner-text-link"
                    href={
                      i.targetType === 'goal'
                        ? `#/v2/goals/${encodeURIComponent(i.targetId)}`
                        : `#/v2/actions/${encodeURIComponent(i.targetId)}`
                    }
                  >
                    Открыть результат
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
