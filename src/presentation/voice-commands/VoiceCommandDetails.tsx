import type {
  VoiceCommandController,
  VoiceCommandState,
} from '../../application/voice-commands/VoiceCommandController';

export function VoiceCommandDetails({
  state,
  controller,
}: {
  readonly state: VoiceCommandState;
  readonly controller: VoiceCommandController;
}) {
  if (state.status === 'selection')
    return (
      <section className="voice-command-preview" aria-label="Выбор задачи">
        <h3>Нашёл несколько вариантов</h3>
        <p>Выберите нужную задачу. Затем проверьте изменение.</p>
        <ul className="voice-command-results">
          {state.targets.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => controller.selectTarget(state.revision, target.id)}
              >
                <span>{target.title}</span>
                <small>{target.date}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  if (
    state.status === 'preview' &&
    state.target &&
    (state.command.type === 'reschedule_task' || state.command.type === 'complete_task')
  )
    return (
      <section className="voice-command-preview" aria-label="Предпросмотр команды">
        <h3>
          {state.command.type === 'reschedule_task'
            ? 'Изменить задачу?'
            : 'Отметить задачу выполненной?'}
        </h3>
        <p className="voice-command-preview-title">{state.target.title}</p>
        {state.command.type === 'reschedule_task' ? (
          <>
            <p>Было: {state.target.date}</p>
            <p>Станет: {state.command.payload.date}</p>
            <p>Причина: {state.command.payload.reason}</p>
            <p className="voice-command-hint">
              Связанные незавершённые действия также будут перенесены. Выполненные останутся на
              прежней дате.
            </p>
          </>
        ) : (
          <>
            <p>Дата: {state.target.date}</p>
            <p>Результат: {state.command.payload.actualResult}</p>
            <p className="voice-command-hint">
              Завершение возможно, если уже есть выполненные действия и нет незавершённых.
            </p>
          </>
        )}
      </section>
    );
  if (state.status === 'success' && state.result.items)
    return (
      <section aria-label="Результаты запроса">
        {state.result.items.length === 0 ? (
          <p>Ничего не найдено. Измените запрос в новой команде.</p>
        ) : (
          <ul className="voice-command-results">
            {state.result.items.map((item, index) => (
              <li key={index}>
                <span>{item.title}</span>
                <small>{item.detail}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  return null;
}
