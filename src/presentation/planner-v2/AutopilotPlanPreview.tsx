import type { AutopilotScheduleBlock } from '../../domain/planner/AutopilotSchedule';
import type { ProposedActionWindow } from '../../domain/planner/DayAutopilot';
import type { DayAutopilotPreview } from '../../application';
import { clockTime, durationLabel } from './timePresentation';
export function AutopilotPlanPreview({
  preview,
  busy,
  onDuration,
  onExclude,
}: {
  readonly preview: DayAutopilotPreview;
  readonly busy: boolean;
  readonly onDuration: (actionId: string, minutes: number) => void;
  readonly onExclude: (actionId: string) => void;
}) {
  const blocks = preview.timeline ?? [];
  const visible = blocks.filter(
    (block) => block.endMinute > preview.startMinute && block.startMinute < preview.endMinute,
  );
  const overlapMinutes = (start: number, end: number) =>
    Math.max(0, Math.min(end, preview.endMinute) - Math.max(start, preview.startMinute));
  const work = visible
    .filter((block) => block.kind === 'action')
    .reduce((sum, block) => sum + overlapMinutes(block.startMinute, block.endMinute), 0);
  const routine = visible
    .filter((block) => block.kind !== 'action' && block.kind !== 'reserve')
    .reduce((sum, block) => sum + overlapMinutes(block.startMinute, block.endMinute), 0);
  const free = Math.max(0, preview.endMinute - preview.startMinute - work - routine);
  return (
    <div className="planner-day-autopilot__preview">
      <div className="planner-day-autopilot__summary">
        <div>
          <span>Работа в плане</span>
          <strong>{durationLabel(work)}</strong>
        </div>
        <div>
          <span>Распорядок и отдых</span>
          <strong>{durationLabel(routine)}</strong>
        </div>
        <div>
          <span>Свободно</span>
          <strong>{durationLabel(free)}</strong>
        </div>
      </div>
      <p className="planner-muted">
        Запас времени: {durationLabel(preview.reserveMinutes)}. Это план; история фокусов
        пополняется после работы с таймером.
      </p>
      {preview.recoverySignal && (
        <p className="planner-day-autopilot__note">
          После короткой ночи оставлен больший резерв: в постели{' '}
          {durationLabel(preview.recoverySignal.minutes)}.
        </p>
      )}
      <AutopilotTimeline
        blocks={blocks}
        proposals={preview.proposals}
        date={preview.date}
        name="Предложенные блоки"
        busy={busy}
        onDuration={onDuration}
        onExclude={onExclude}
      />
      {!preview.proposals.length && (
        <p className="planner-empty">Подходящих свободных дел нет. Измените фокус или пожелания.</p>
      )}
      {preview.uncoveredWishes?.length ? (
        <p className="planner-day-autopilot__note">
          Не все пожелания покрыты: подходящие дела не найдены, уже исключены, либо не поместились
          по времени или лимиту.
        </p>
      ) : null}
      {preview.deferred.length ? (
        <div className="planner-day-autopilot__deferred">
          <h4>Не поместилось</h4>
          <ul>
            {preview.deferred.map((item) => (
              <li key={item.actionId}>
                <span>{item.title}</span>
                <span>
                  {item.reason === 'active_session'
                    ? 'Уже выполняется'
                    : item.hadScheduledWindow
                      ? 'Будет убрано из будущего расписания'
                      : `Нужно ${durationLabel(item.requestedMinutes)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AutopilotTimeline({
  blocks,
  proposals,
  date,
  name,
  busy,
  onDuration,
  onExclude,
}: {
  readonly blocks: readonly AutopilotScheduleBlock[];
  readonly proposals: readonly ProposedActionWindow[];
  readonly date: string;
  readonly name: string;
  readonly busy: boolean;
  readonly onDuration?: (actionId: string, minutes: number) => void;
  readonly onExclude?: (actionId: string) => void;
}) {
  return (
    <ol className="planner-day-autopilot__timeline autopilot-timeline" aria-label={name}>
      {blocks.map((block) => {
        const proposal = proposals.find((item) => item.actionId === block.actionId);
        return (
          <li key={block.id} data-kind={block.kind}>
            <time>
              {clockTime(block.startMinute)}–{clockTime(block.endMinute)}
            </time>
            <span className="planner-day-autopilot__line" aria-hidden="true" />
            <div>
              <strong>{block.title}</strong>
              <span>
                {proposal
                  ? proposal.isMain
                    ? 'Главное'
                    : proposal.reason === 'focus'
                      ? 'Главный фокус'
                      : proposal.reason === 'wish'
                        ? 'Пожелание на день'
                        : 'Из плана дня'
                  : block.protected
                    ? 'Сохранённое окно'
                    : block.kind === 'reserve'
                      ? 'Не занят делами'
                      : 'Распорядок'}{' '}
                · {durationLabel(block.endMinute - block.startMinute)}
                {proposal?.usedDefaultEstimate ? ' · Оценка 25 минут — можно изменить' : ''}
                {proposal?.previousDate !== undefined && proposal.previousDate !== date
                  ? ` · ${proposal.previousDate ? `перенос с ${proposal.previousDate}` : 'из дел без даты'}`
                  : ''}
              </span>
              {proposal && onDuration && onExclude && (
                <div className="autopilot-timeline__edit">
                  <label>
                    Длительность: {proposal.title}
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={proposal.durationMinutes}
                      key={`${proposal.actionId}:${proposal.durationMinutes}`}
                      disabled={busy}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (value !== proposal.durationMinutes)
                          onDuration(proposal.actionId, value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onExclude(proposal.actionId)}
                  >
                    Исключить
                  </button>
                </div>
              )}
              {block.kind === 'morning' ? (
                <a href="#/v2/routine/morning">Открыть утренние практики →</a>
              ) : block.kind === 'evening' || block.kind === 'sleep' ? (
                <a href="#/v2/sleep?from=routine">Открыть подготовку ко сну →</a>
              ) : block.kind === 'walk' ? (
                <a href="#/v2/walks">Открыть прогулки →</a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
