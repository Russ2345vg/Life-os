import { DomainError } from '../../shared/errors/DomainError';

export function assertWalkPayloadCompatible(
  type: string,
  record: Readonly<Record<string, unknown>>,
  confirmedDataFormat: 1 | 2 = 1,
): void {
  if (type === 'walk') assertWalkSyncV1Compatible(record, confirmedDataFormat);
  if (type === 'walk_capture' && record.promptStage != null)
    throw new DomainError(
      'sync.client_update_required',
      'Ответы на вопросы прогулки пока сохраняются локально. Для синхронизации требуется обновление формата на всех устройствах.',
    );
  if (confirmedDataFormat === 2) return;
  if (type === 'walk_capture' && record.resultActionId != null)
    throw new DomainError(
      'sync.client_update_required',
      'Связь мысли с действием требует обновления формата синхронизации. Исходная мысль сохранена.',
    );
  if ((type === 'life_action' || type === 'recurrence_rule') && record.walkPlan != null)
    throw new DomainError(
      'sync.client_update_required',
      'Планы прогулок требуют обновления формата синхронизации на всех устройствах.',
    );
}

/** The server-confirmed space floor is required before sending newer walk fields. */
export function assertWalkSyncV1Compatible(
  record: Readonly<Record<string, unknown>>,
  confirmedDataFormat: 1 | 2 = 1,
): void {
  if (
    record.reflectionNotes != null ||
    ['ownQuestion', 'self', 'dailyReview', 'priorities', 'relationships', 'ideas'].includes(
      String(record.reflectionTemplate),
    )
  )
    throw new DomainError(
      'sync.client_update_required',
      'Новые сценарии размышления пока сохраняются локально. Для синхронизации требуется обновление формата на всех устройствах.',
    );
  if (confirmedDataFormat === 2) return;
  if (record.deletedAt != null)
    throw new DomainError(
      'sync.client_update_required',
      'Удаление прогулок требует поддержки нового формата на всех устройствах. Пока синхронизация включена, запись сохранена без удаления.',
    );
  if (
    record.status !== 'planned' &&
    (typeof record.reflectionQuestion !== 'string' || !record.reflectionQuestion.trim())
  ) {
    throw new DomainError(
      'sync.client_update_required',
      'Свободная прогулка без вопроса пока доступна только локально: подключённые версии синхронизации требуют вопрос. Можно указать свой вопрос в настройке прогулки.',
    );
  }
}
