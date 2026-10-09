import { useRef, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import {
  MAX_WALK_CAPTURE_LENGTH,
  type WalkCapture,
} from '../../../domain/walk-capture/WalkCapture';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { useWalkMutation } from './useWalkState';
import { WalkNotePrompts } from './WalkNotePrompts';
export function WalkCaptureComposer({
  services,
  walkId,
  captures,
}: {
  services: WalkServices;
  walkId: string;
  captures: readonly WalkCapture[];
}) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mutation = useWalkMutation();
  return (
    <aside className="walk-side">
      <h2>Мысли на ходу</h2>
      <p>Запишите коротко, чтобы вернуться позже.</p>
      <WalkNotePrompts
        draft={text}
        busy={mutation.busy}
        onAppend={(value) => {
          setText(value);
          setSaved(false);
          requestAnimationFrame(() => {
            textarea.current?.focus();
            textarea.current?.setSelectionRange(value.length, value.length);
          });
        }}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.perform(
            `capture:${walkId}:${text}`,
            (requestId) => services.captures.capture({ walkId, requestId, content: text }),
            () => {
              setText('');
              setSaved(true);
            },
          );
        }}
      >
        <label htmlFor="walk-thought">Новая мысль</label>
        <VoiceTextArea
          ref={textarea}
          id="walk-thought"
          rows={4}
          maxLength={MAX_WALK_CAPTURE_LENGTH}
          value={text}
          onValueChange={(value) => {
            setText(value);
            setSaved(false);
          }}
          placeholder="Что хочется сохранить?"
        />
        <div className="walk-composer-footer">
          <small>
            {text.length}/{MAX_WALK_CAPTURE_LENGTH}
          </small>
          <button disabled={mutation.busy || !text.trim()}>Сохранить мысль</button>
        </div>
        {mutation.error && <p role="alert">{mutation.error}</p>}
        {saved && <p role="status">Мысль сохранена</p>}
      </form>
      <div className="walk-notes">
        {captures.some((capture) => capture.promptStage === null) ? (
          captures
            .filter((capture) => capture.promptStage === null)
            .map((capture) => (
              <article key={capture.id.toString()}>
                <small>{Math.floor(capture.walkElapsedMs / 60000)} мин от начала</small>
                <p>{capture.content}</p>
              </article>
            ))
        ) : (
          <p>Здесь появятся ваши мысли. Можно ничего не записывать.</p>
        )}
      </div>
    </aside>
  );
}
