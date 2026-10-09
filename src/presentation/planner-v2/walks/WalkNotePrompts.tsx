import { useState } from 'react';
import {
  appendWalkNoteQuestion,
  WALK_NOTE_TOPICS,
} from '../../../application/walk/WalkNotePrompts';

export function WalkNotePrompts({
  draft,
  busy,
  onAppend,
}: {
  draft: string;
  busy: boolean;
  onAppend: (text: string) => void;
}) {
  const [selection, setSelection] = useState({ topic: 0, question: 0 });
  const topic = WALK_NOTE_TOPICS[selection.topic]!;
  const question = topic.questions[selection.question]!;
  const insertion = appendWalkNoteQuestion(draft, question);

  return (
    <details className="walk-note-prompts">
      <summary>Вопросы для заметки</summary>
      <div className="walk-note-prompts-body">
        <p className="walk-muted">Выберите то, что откликается. Можно пропускать вопросы.</p>
        <label htmlFor="walk-note-topic">
          Тема размышления
          <select
            id="walk-note-topic"
            value={topic.id}
            onChange={(event) => {
              const index = WALK_NOTE_TOPICS.findIndex((item) => item.id === event.target.value);
              if (index >= 0) setSelection({ topic: index, question: 0 });
            }}
          >
            {WALK_NOTE_TOPICS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div aria-live="polite" aria-atomic="true">
          <small>
            Вопрос {selection.question + 1} из {topic.questions.length}
          </small>
          <p className="walk-note-question">{question}</p>
        </div>
        <div className="walk-note-question-nav">
          <button
            type="button"
            disabled={selection.question === 0}
            onClick={() => setSelection({ ...selection, question: selection.question - 1 })}
          >
            Предыдущий вопрос
          </button>
          <button
            type="button"
            disabled={selection.question === topic.questions.length - 1}
            onClick={() => setSelection({ ...selection, question: selection.question + 1 })}
          >
            Следующий вопрос
          </button>
        </div>
        <button
          type="button"
          disabled={busy || insertion.status !== 'added'}
          onClick={() => onAppend(insertion.text)}
        >
          Добавить вопрос в заметку
        </button>
        {insertion.status === 'alreadyAdded' && (
          <p role="status">Вопрос уже в заметке — можно дописать ответ.</p>
        )}
        {insertion.status === 'tooLong' && (
          <p role="status">
            Не хватает места для вопроса. Сохраните текущую мысль и начните следующую.
          </p>
        )}
      </div>
    </details>
  );
}
