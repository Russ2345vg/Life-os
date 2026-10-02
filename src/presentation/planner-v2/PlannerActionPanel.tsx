import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerActionOperations } from './PlannerActionList';
import { PlannerActionList } from './PlannerActionList';
import type { SetActionTime } from './PlannerActionTimeSheet';
import type { usePlannerLibraryReadModel } from './usePlannerLibraryReadModel';
import { PlannerSheet } from './PlannerSheet';
import { QuickAccessGuardScope, useQuickAccess } from './QuickAccessContext';
import { PlannerUnsavedChangesConfirmation } from './PlannerUnsavedChangesConfirmation';
import {
  createPlannerActionPanelLeaveGuard,
  type PlannerActionPanelLeaveGuard,
} from './PlannerActionPanelGuard';
import './planner-action-panel.css';

export function PlannerActionPanel({
  actionId,
  today,
  reads,
  operations,
  onSetTime,
  onClose,
  onRetry,
  onReturnFocus,
  registerGuard,
  feedback,
  onRetryCompletion,
  commandError,
  onDismissCommandError,
  onStartWalk,
}: {
  readonly actionId: string;
  readonly today: string;
  readonly reads: ReturnType<typeof usePlannerLibraryReadModel>;
  readonly operations: PlannerActionOperations;
  readonly onSetTime?: SetActionTime | undefined;
  readonly onClose: () => void;
  readonly onRetry: () => Promise<void>;
  readonly onReturnFocus: () => HTMLElement | null;
  readonly registerGuard: (guard: PlannerActionPanelLeaveGuard) => () => void;
  readonly feedback: string | null;
  readonly onRetryCompletion: () => void;
  readonly commandError: string | null;
  readonly onDismissCommandError: () => void;
  readonly onStartWalk?: ((actionId: string, requestId: string) => Promise<void>) | undefined;
}) {
  const quick = useQuickAccess();
  const quickRef = useRef(quick);
  useEffect(() => {
    quickRef.current = quick;
  }, [quick]);
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [busyMessage, setBusyMessage] = useState(false);
  const [walkStartError, setWalkStartError] = useState('');
  const [walkStartBusy, setWalkStartBusy] = useState(false);
  const walkRequestId = useRef<string | null>(null);
  const decide = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => {
    const guard = createPlannerActionPanelLeaveGuard(
      () => {
        const panel = quickRef.current?.inspect('action-panel');
        const summary = quickRef.current?.inspect('action-summary');
        const time = quickRef.current?.inspect('action-time');
        return {
          dirty: Boolean(panel?.dirty || summary?.dirty || time?.dirty),
          busy: Boolean(panel?.busy || summary?.busy || time?.busy),
        };
      },
      () =>
        new Promise<boolean>((resolve) => {
          decide.current = resolve;
          setConfirm(true);
        }),
      () => setBusyMessage(true),
    );
    return registerGuard(guard);
  }, [registerGuard]);
  useEffect(
    () => () => {
      decide.current?.(false);
      decide.current = null;
    },
    [],
  );
  const answer = (value: boolean) => {
    setConfirm(false);
    decide.current?.(value);
    decide.current = null;
  };
  const data = reads.snapshot.data;
  const selected = data?.actions.find((action) => action.id.toString() === actionId);
  const childHost = confirm
    ? document.querySelector<HTMLDialogElement>(
        'dialog[aria-label="Быстрый доступ"][open], dialog[aria-label="Итог задачи"][open], dialog[aria-label="Запланировать действие"][open]',
      )
    : null;
  const confirmation = confirm ? (
    <PlannerUnsavedChangesConfirmation
      onContinue={() => answer(false)}
      onDiscard={() => answer(true)}
    />
  ) : null;
  return (
    <QuickAccessGuardScope scope="action-panel">
      <PlannerSheet
        title="Действие"
        onClose={onClose}
        lockScroll
        initialFocus={() => heading.current}
        returnFocus={onReturnFocus}
      >
        <div className="planner-action-panel">
          <header className="planner-action-panel__heading">
            <p className="planner-eyebrow">Управление действием</p>
            <h2 ref={heading} tabIndex={-1}>
              {selected?.title.toString() ?? 'Действие'}
            </h2>
          </header>
          {selected?.walkPlan && onStartWalk && (
            <div>
              <button
                disabled={walkStartBusy}
                onClick={() => {
                  if (!walkRequestId.current) walkRequestId.current = crypto.randomUUID();
                  setWalkStartBusy(true);
                  setWalkStartError('');
                  void onStartWalk(actionId, walkRequestId.current)
                    .catch((failure: unknown) =>
                      setWalkStartError(
                        failure instanceof Error ? failure.message : 'Не удалось начать прогулку.',
                      ),
                    )
                    .finally(() => setWalkStartBusy(false));
                }}
              >
                Начать прогулку по плану
              </button>
              {walkStartError && <p role="alert">{walkStartError}</p>}
            </div>
          )}
          {data ? (
            <PlannerActionList
              key={actionId}
              actions={data.actions}
              goals={data.goals}
              directions={data.directions}
              spheres={data.spheres}
              today={today}
              selectedId={actionId}
              onNew={() => undefined}
              onSetTime={onSetTime}
              presentation="panel"
              {...operations}
            />
          ) : reads.snapshot.error ? (
            <div role="alert" className="planner-error">
              <p>Не удалось загрузить действие. {reads.snapshot.error.message}</p>
              <button type="button" onClick={() => void onRetry()}>
                Повторить загрузку
              </button>
            </div>
          ) : (
            <p role="status">Загружаем действие…</p>
          )}
          {feedback && (
            <div role="alert" className="planner-error">
              <p>{feedback}</p>
              <button type="button" onClick={onRetryCompletion}>
                Повторить загрузку
              </button>
            </div>
          )}
          {commandError && (
            <div role="alert" className="planner-error">
              <p>{commandError}</p>
              <button type="button" onClick={onDismissCommandError}>
                Закрыть сообщение
              </button>
            </div>
          )}
          {busyMessage && <p role="status">Дождитесь завершения сохранения.</p>}
          {confirmation && !childHost && confirmation}
        </div>
      </PlannerSheet>
      {confirmation && childHost && createPortal(confirmation, childHost)}
    </QuickAccessGuardScope>
  );
}
