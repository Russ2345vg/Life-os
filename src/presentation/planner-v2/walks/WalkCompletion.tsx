import { useState } from 'react';
import type { Walk } from '../../../domain/walk/Walk';
import type { WalkServices } from '../../../application/walk/WalkServices';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { WalkRating } from './WalkStartForm';
import { useWalkMutation, walkDuration } from './useWalkState';
export function WalkCompletion({
  walk,
  services,
  onDone,
  onContinue,
}: {
  walk: Walk;
  services: WalkServices;
  onDone: () => void;
  onContinue?: (() => void) | undefined;
}) {
  const [result, setResult] = useState(walk.result ?? '');
  const [notes, setNotes] = useState({
    understood: walk.reflectionNotes?.understood ?? '',
    open: walk.reflectionNotes?.open ?? '',
    next: walk.reflectionNotes?.next ?? '',
  });
  const [afterState, setAfterState] = useState(walk.afterState);
  const [impact, setImpact] = useState(walk.impact);
  const [baseVersion, setBaseVersion] = useState(walk.version);
  const [saved, setSaved] = useState(false);
  const mutation = useWalkMutation();
  return (
    <section className="walk-panel walk-completion">
      <span className="walk-label">
        {walk.status === 'completed' ? 'Прогулка завершена' : 'Прогулка прервана'}
      </span>
      <h2>Время для себя</h2>
      <p className="walk-completion-duration">{walkDuration(walk)}</p>
      <p>{walk.date.toString()} · Паузы исключены</p>
      {walk.result && <p>{walk.result}</p>}
      {walk.reflectionNotes && (
        <div className="walk-reflection-summary">
          {walk.reflectionNotes.understood && (
            <p>
              <strong>Что понял:</strong> {walk.reflectionNotes.understood}
            </p>
          )}
          {walk.reflectionNotes.open && (
            <p>
              <strong>Что осталось открытым:</strong> {walk.reflectionNotes.open}
            </p>
          )}
          {walk.reflectionNotes.next && (
            <p>
              <strong>Что хочу сделать:</strong> {walk.reflectionNotes.next}
            </p>
          )}
        </div>
      )}
      {walk.status === 'completed' && (
        <details className="walk-reflection-fields">
          <summary>Добавить итог и оценку</summary>
          <form
            className="walk-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutation.perform(
                `reflection:${walk.id}:${baseVersion}:${result}:${JSON.stringify(notes)}:${impact}:${JSON.stringify(afterState)}`,
                (requestId) =>
                  services.commands.saveReflection({
                    walkId: walk.id.toString(),
                    expectedVersion: baseVersion,
                    requestId,
                    reflection: {
                      result,
                      ...(walk.intent === 'reflection'
                        ? {
                            notes: {
                              understood: notes.understood,
                              open: notes.open,
                              next: notes.next,
                            },
                          }
                        : {}),
                      afterState,
                      impact,
                    },
                  }),
                (updated) => {
                  setBaseVersion(updated.version);
                  setSaved(true);
                },
              );
            }}
          >
            {walk.intent === 'reflection' ? (
              <>
                {walk.result !== null && (
                  <>
                    <label htmlFor="walk-result">Ранее сохранённый итог</label>
                    <VoiceTextArea
                      id="walk-result"
                      rows={3}
                      maxLength={1000}
                      value={result}
                      onValueChange={(value) => {
                        setResult(value);
                        setSaved(false);
                      }}
                    />
                  </>
                )}
                {(['understood', 'open', 'next'] as const).map((key) => (
                  <div key={key}>
                    <label htmlFor={`walk-note-${key}`}>
                      {key === 'understood'
                        ? 'Что понял'
                        : key === 'open'
                          ? 'Что осталось открытым'
                          : 'Что хочу сделать'}
                    </label>
                    <VoiceTextArea
                      id={`walk-note-${key}`}
                      rows={3}
                      maxLength={500}
                      value={notes[key]}
                      onValueChange={(value) => {
                        setNotes({ ...notes, [key]: value });
                        setSaved(false);
                      }}
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
                <label htmlFor="walk-result">Итог прогулки</label>
                <VoiceTextArea
                  id="walk-result"
                  rows={4}
                  maxLength={1000}
                  value={result}
                  onValueChange={(value) => {
                    setResult(value);
                    setSaved(false);
                  }}
                />
              </>
            )}
            <WalkRating
              label="Состояние после прогулки"
              value={afterState}
              onChange={setAfterState}
            />
            <label>
              Как повлияла прогулка?
              <select
                value={impact ?? ''}
                onChange={(event) =>
                  setImpact(
                    event.target.value === ''
                      ? null
                      : (event.target.value as NonNullable<Walk['impact']>),
                  )
                }
              >
                <option value="" disabled={walk.reentry !== null}>
                  Без оценки
                </option>
                <option value="better">Лучше</option>
                <option value="same">Так же</option>
                <option value="worse">Хуже</option>
              </select>
            </label>
            {walk.reentry && (
              <p>
                У этой старой записи оценка связана с возвращением к действию. Её можно изменить, но
                нельзя очистить.
              </p>
            )}
            {mutation.error && <p role="alert">{mutation.error}</p>}
            {walk.version > baseVersion && (
              <button
                type="button"
                onClick={() => {
                  setResult(walk.result ?? '');
                  setNotes({
                    understood: walk.reflectionNotes?.understood ?? '',
                    open: walk.reflectionNotes?.open ?? '',
                    next: walk.reflectionNotes?.next ?? '',
                  });
                  setAfterState(walk.afterState);
                  setImpact(walk.impact);
                  setBaseVersion(walk.version);
                  setSaved(false);
                }}
              >
                Загрузить актуальную запись
              </button>
            )}
            {saved && <p role="status">Итог сохранён</p>}
            <button disabled={mutation.busy}>Сохранить итог</button>
          </form>
        </details>
      )}
      <div className="walk-completion-actions">
        {onContinue && <button onClick={onContinue}>Продолжить тему</button>}
        <button className="planner-primary" onClick={onDone}>
          Готово
        </button>
      </div>
    </section>
  );
}
