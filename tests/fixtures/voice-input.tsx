import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceInputProvider } from '../../src/app/providers/VoiceInputProvider';
import { VoiceTextInput } from '../../src/presentation/voice-input/VoiceTextInput';
import { VoiceTextArea } from '../../src/presentation/voice-input/VoiceTextArea';
import { VoiceField } from '../../src/presentation/voice-input/VoiceField';
import '../../src/presentation/styles/tokens.css';
import '../../src/presentation/styles/planning-tomorrow.css';

function Fixture() {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [submits, setSubmits] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => setDisabled(!disabled)}>Toggle disabled</button>
      <button onClick={() => setMounted(!mounted)}>Toggle mount</button>
      <button onClick={() => ref.current?.focus()}>Focus via ref</button>
      <output aria-label="Submits">{submits}</output>
      {mounted ? (
        <VoiceInputProvider>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmits(submits + 1);
            }}
          >
            <VoiceField>
              <span>Название</span>
              <VoiceTextInput
                id="fixture-title"
                ref={ref}
                value={value}
                onValueChange={setValue}
                disabled={disabled}
                maxLength={30}
                required
                endActions={
                  <button type="button" onClick={() => setValue('')}>
                    Очистить
                  </button>
                }
              />
            </VoiceField>
            <VoiceField>
              <span>Заметка</span>
              <span className="tomorrow-textarea-shell">
                <VoiceTextArea id="fixture-note" value={note} onValueChange={setNote} />
                <small aria-hidden="true">{note.length} / 1000</small>
              </span>
            </VoiceField>
            <VoiceField>
              <span>Поиск</span>
              <VoiceTextInput type="search" value={note} onValueChange={setNote} />
            </VoiceField>
            <button type="submit">Save</button>
          </form>
        </VoiceInputProvider>
      ) : null}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
