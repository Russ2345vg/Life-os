import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  Day,
  DayDate,
  DAY_STATUS,
  DECISION_KIND,
  DECISION_PRIORITY,
  Decision,
  DecisionTitle,
  EntityId,
  ExpectedResult,
  Project,
  SESSION_COMPLETION_KIND,
  SessionResultNote,
  Sphere,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success } from '../../shared/result/Result';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { formatDuration, scheduleSessionTimer } from '../session/sessionTimer';
import { TodayPageView } from './TodayPage';
import { resolveTodayScreenState } from './TodayScreenState';
import {
  ACTION_COMPLETION_CHOICE,
  ACTION_COMPLETION_FAILED_MESSAGE,
  cancelLifeActionResult,
  completeSessionWorkflow,
  completeSessionErrorMessage,
  cancelDecisionResult,
  confirmDecisionResult,
  createDecisionAndReload,
  createLifeActionAndReload,
  decisionCancellationErrorMessage,
  decisionConfirmationErrorMessage,
  decisionEditErrorMessage,
  decisionRescheduleErrorMessage,
  INITIAL_TODAY_PAGE_STATE,
  isDecisionActivationKey,
  isLifeActionActivationKey,
  lifeActionCancellationErrorMessage,
  lifeActionEditErrorMessage,
  lifeActionRescheduleErrorMessage,
  loadSelectedDateDecisions,
  loadTomorrowPlanSummaryData,
  pauseSessionErrorMessage,
  retryLifeActionCompletion,
  rescheduleLifeActionResult,
  rescheduleDecisionResult,
  resumeSessionErrorMessage,
  startSessionErrorMessage,
  todayPageReducer,
  updateDecisionDetailsResult,
  updateLifeActionDetailsResult,
  validateDecisionForm,
  validateLifeActionForm,
  validateLifeActionEditForm,
  validateLifeActionRescheduleForm,
  validateDecisionRescheduleForm,
  validateDecisionConfirmationForm,
  validateDecisionEditForm,
  validateSessionCompletionForm,
  type TodayPageState,
} from './TodayPageState';

const DATE = DayDate.create('2026-08-02');
const NOOP = () => undefined;

describe('TodayPage view and workflow', () => {
  it('показывает текущую дату по-русски без старого технического экрана', () => {
    const markup = renderView(createReadyState([]));

    expect(markup).toContain('План дня');
    expect(markup).toContain('Сегодня');
    expect(markup).toContain('2 августа 2026 г.');
    expect(markup.match(/2 августа 2026 г\./g)).toHaveLength(1);
    expect(markup).not.toContain('Данные сохраняются на этом устройстве');
    expect(markup).not.toContain('Локальная система готова');
    expect(markup).not.toContain('IndexedDB');
    expect(markup).not.toContain('repository');
  });

  it('собирает страницу Сегодня в dashboard с компактной правой колонкой', () => {
    const markup = renderView(createReadyState([]));

    expect(markup).toContain('class="today-dashboard"');
    expect(markup).toContain('aria-label="Рабочая панель дня"');
    expect(markup).toContain('Быстрые действия');
    expect(markup).toContain('Напоминания');
    expect(markup).toContain('Нет активных напоминаний');
    expect(markup).toContain('Фокус сегодня');
    expect(markup).toContain('Фокус не задан');
    expect(markup).toContain('Распорядок дня');
  });

  it('показывает явное начало дня и блокирует его без главного решения', () => {
    const markup = renderView(createReadyState([]));

    expect(markup).toContain('День не начат');
    expect(markup).toContain('Сначала создайте главное Решение');
    expect(markup).toContain('0 из 3');
    expect(markup).toContain('Создать Решение');
    expect(markup).not.toContain('Место свободно');
  });

  it('разрешает кнопку начала при наличии главного решения', () => {
    const state = createReadyState([
      createPlannedDecision('main-start', DATE, DECISION_KIND.main, 1),
    ]);
    const markup = renderView(state);
    const loadingMarkup = renderView(state, DATE, createCurrentPlannedDay(), {
      isStartingDay: true,
    });

    expect(markup).toContain('1 из 3');
    expect(markup).toContain('Начать день');
    expect(loadingMarkup).toContain('Начинаем…');
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(loadingMarkup).toContain('disabled=""');
  });

  it('до запуска блокирует начало дня и показывает восстановление при нескольких активных днях', () => {
    const firstOpen = createOpenDayForRecovery('conflict-first', DayDate.create('2026-08-01'));
    const secondOpen = createOpenDayForRecovery('conflict-second', DayDate.create('2026-08-02'));
    const markup = renderView(
      createReadyState([createPlannedDecision('main-conflict', DATE, DECISION_KIND.main, 1)]),
      DATE,
      createCurrentPlannedDay(),
      {
        openDayConflictState: {
          status: 'ready',
          snapshot: {
            hasConflict: true,
            openDays: [
              { day: firstOpen, hasUnfinishedSession: false },
              { day: secondOpen, hasUnfinishedSession: false },
            ],
            unfinishedSession: null,
            unfinishedLifeAction: null,
            unfinishedSessionDayId: null,
            hasOrphanedUnfinishedSession: false,
          },
        },
      },
    );

    expect(markup).toContain('Обнаружено несколько активных дней');
    expect(markup).toContain('Восстановить состояние');
    expect(markup).toContain('LifeOS остановил запуск нового дня');
    expect(markup).not.toContain('Начать день');
  });

  it('показывает точную дату единственного прошлого активного дня и блокирует запуск сегодня', () => {
    const staleDate = DayDate.create('2026-08-01');
    const staleDay = createOpenDayForRecovery('single-stale-open', staleDate);
    const markup = renderView(
      createReadyState([createPlannedDecision('main-current', DATE, DECISION_KIND.main, 1)]),
      DATE,
      createCurrentPlannedDay(),
      {
        openDayConflictState: {
          status: 'ready',
          snapshot: {
            hasConflict: false,
            openDays: [{ day: staleDay, hasUnfinishedSession: false }],
            unfinishedSession: null,
            unfinishedLifeAction: null,
            unfinishedSessionDayId: null,
            hasOrphanedUnfinishedSession: false,
          },
        },
      },
    );

    expect(markup).toContain('Незавершённый день');
    expect(markup).toContain('День 1 августа 2026 г. всё ещё открыт');
    expect(markup).toContain('Открыть активный день');
    expect(markup).toContain('Новый день нельзя начать');
    expect(markup).not.toContain('Начать день');
  });

  it('для прошлого активного дня оставляет только безопасное завершение через вечерний контроль', () => {
    const staleDate = DayDate.create('2026-08-01');
    const staleDay = createOpenDayForRecovery('selected-stale-open', staleDate);
    const markup = renderView(createReadyState([]), staleDate, createCurrentPlannedDay(), {
      openDayConflictState: {
        status: 'ready',
        snapshot: {
          hasConflict: false,
          openDays: [{ day: staleDay, hasUnfinishedSession: false }],
          unfinishedSession: null,
          unfinishedLifeAction: null,
          unfinishedSessionDayId: null,
          hasOrphanedUnfinishedSession: false,
        },
      },
    });

    expect(markup).toContain('Открыть вечерний контроль');
    expect(markup).toContain('Обычное редактирование прошлого дня заблокировано');
    expect(markup).not.toContain('Прошедший день доступен только для просмотра');
    expect(markup).not.toContain('>Создать решение</button>');
  });

  it('открывает вечерний контроль только для начатого дня', () => {
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay());

    expect(markup).toContain('День идёт');
    expect(markup).toContain('Вечерний контроль');
    expect(markup).toContain('Проверьте остатки, запишите итог и подготовьте завтра.');
    expect(markup).not.toContain('Начать день');
  });

  it('показывает начатый день с текущим действием отдельно от пустого состояния', () => {
    const action = createReadyLifeAction('today-screen-ready-action', DATE);
    const startedMarkup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [action],
    });
    const emptyMarkup = renderView(createReadyState([]), DATE, createCurrentOpenDay());

    expect(startedMarkup).toContain('День начат');
    expect(startedMarkup).toContain('today-screen-ready-action');
    expect(startedMarkup).toContain('>Начать<');
    expect(startedMarkup).toContain('>Открыть<');
    expect(emptyMarkup).toContain('Нет текущего действия');
    expect(emptyMarkup).not.toContain('current-action-primary-button');
  });

  it('показывает следующее действие как спокойную подсказку без кнопки запуска', () => {
    const current = createReadyLifeAction('today-current-action', DATE, {
      createdAt: new Date('2026-08-02T08:00:00.000+09:00'),
    });
    const next = createReadyLifeAction('today-next-action', DATE, {
      createdAt: new Date('2026-08-02T08:05:00.000+09:00'),
    });
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [next, current],
    });

    expect(markup).toContain('Следующее действие');
    expect(markup).toContain('today-next-action');
    expect(markup).toContain('Следующие Действия');
    expect(markup.match(/current-action-primary-button/g)).toHaveLength(1);
    expect(markup.match(/>Начать</g)).toHaveLength(1);
  });

  it('показывает навигацию, счётчик и выбранное действие среди нескольких доступных', () => {
    const first = createReadyLifeAction('today-navigator-first', DATE, {
      createdAt: new Date('2026-08-02T08:00:00.000+09:00'),
    });
    const second = createReadyLifeAction('today-navigator-second', DATE, {
      createdAt: new Date('2026-08-02T08:05:00.000+09:00'),
    });
    const third = createReadyLifeAction('today-navigator-third', DATE, {
      createdAt: new Date('2026-08-02T08:10:00.000+09:00'),
    });
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [third, first, second],
      preferredLifeActionId: second.id.toString(),
    });

    expect(markup).toContain('Действия дня');
    expect(markup).toContain('2 из 3');
    expect(markup).toContain('today-navigator-second');
    expect(markup).toContain('Следующие Действия');
    expect(markup).toContain('today-navigator-third');
  });

  it('блокирует переключение во время незавершённой рабочей сессии', () => {
    const active = markLifeActionInProgress(createReadyLifeAction('today-navigator-active', DATE));
    const other = createReadyLifeAction('today-navigator-other', DATE);
    const session = createSession('today-navigator-session', active.id);
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [other, active],
      currentDaySessions: [session],
      unfinishedSession: session,
      preferredLifeActionId: other.id.toString(),
    });

    expect(markup).toContain('today-navigator-active');
    expect(markup).toContain('Выбор другого действия доступен после завершения');
    expect(markup).toContain('Сессия идёт');
  });

  it('показывает явное пустое состояние, когда продолжение не запланировано', () => {
    const current = createReadyLifeAction('today-only-action', DATE);
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [current],
    });

    expect(markup).toContain('Следующие Действия');
    expect(markup).toContain('продолжение пока не запланировано');
  });

  it('показывает активную и приостановленную сессию как разные состояния главного экрана', () => {
    const action = markLifeActionInProgress(
      createReadyLifeAction('today-screen-session-action', DATE),
    );
    const session = createSession('today-screen-session', action.id);
    const runningMarkup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [action],
      currentDaySessions: [session],
      unfinishedSession: session,
    });

    pauseSession(session);
    const pausedMarkup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      currentLifeActions: [action],
      currentDaySessions: [session],
      unfinishedSession: session,
    });

    expect(runningMarkup).toContain('Рабочая сессия идёт');
    expect(runningMarkup).toContain('>Завершить<');
    expect(runningMarkup).toContain('>Пауза<');
    expect(pausedMarkup).toContain('Рабочая сессия на паузе');
    expect(pausedMarkup).toContain('>Пауза<');
  });

  it('показывает открытый вечерний контроль отдельным состоянием главной страницы', () => {
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      isEveningControlOpen: true,
    });

    expect(markup).toContain('Шаг завершения');
    expect(markup).toContain('Проверка дня открыта');
  });

  it('показывает контролируемую ошибку восстановления без изменения данных', () => {
    const markup = renderView(createReadyState([]), DATE, createCurrentOpenDay(), {
      recoveryStatus: 'error',
    });

    expect(markup).toContain('Не удалось восстановить состояние дня');
    expect(markup).toContain('Данные не изменены');
    expect(markup).toContain('Повторить восстановление');
    expect(markup).not.toContain('repository');
  });

  it('после завершения показывает сохранённый итог и не предлагает завершить день повторно', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(markup).toContain('День завершён');
    expect(markup).toContain('Итог контрольного дня');
    expect(markup).toContain('Сфера результата');
    expect(markup).toContain('Разработка');
    expect(markup).not.toContain('Повторное завершение и запуск недоступны');
    expect(markup).not.toContain('Вечерний контроль');
    expect(markup).not.toContain('Начать день');
  });

  it('показывает завершённый день как итог с единственным следующим главным действием', () => {
    const completedDecision = confirmDecision(
      createPlannedDecision('closed-day-main', DATE, DECISION_KIND.main, 1),
    );
    const markup = renderView(
      createReadyState([completedDecision]),
      DATE,
      createCompletedCurrentDay(),
    );

    expect(markup).toContain('aria-label="Итоги завершённого дня"');
    expect(markup).toContain('План пока не подготовлен');
    expect(markup.match(/>Подготовить план</g)).toHaveLength(1);
    expect(markup).not.toContain('today-plan-next-button');
    expect(markup).not.toContain('Фокус сегодня');
    expect(markup).not.toContain('Добавить главное решение');
  });

  it('делает сохранённый итог визуальным центром без повторения статуса завершения', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(markup).toContain('class="today-closed-hero"');
    expect(markup).toContain('<h1 id="day-state-title">День завершён</h1>');
    expect(markup).toContain('d="m7 12.5 3.2 3.2L17.5 8.5"');
    expect(markup.match(/День завершён/g)).toHaveLength(1);
    expect(markup).toContain('Итог сохранён · Закрыт в 21:00');
    expect(markup).toContain('>Итог дня</h3>');
    expect(markup).toContain('Итог контрольного дня');
    expect(markup).toContain('Сфера результата');
    expect(markup).toContain('>Изменить</button>');
    expect(markup.indexOf('Итог контрольного дня')).toBeLessThan(
      markup.indexOf('Сфера результата'),
    );
    expect(markup).not.toContain('Повторное завершение и запуск недоступны');
    expect(markup).not.toContain('Цикл закрыт');
  });

  it('использует для закрытого дня компактный контекст даты без второго крупного заголовка', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(markup).toContain('class="today-closed-date-context"');
    expect(markup).toContain('Воскресенье');
    expect(markup).toContain('2 августа 2026 г.');
    expect(markup).not.toContain('<p class="today-brand">План дня</p>');
    expect(markup).not.toContain('<header class="today-header">');
  });

  it('показывает согласованные показатели закрытого дня с естественными пустыми состояниями', () => {
    const completedDecision = confirmDecision(
      createPlannedDecision('closed-metric', DATE, DECISION_KIND.main, 1),
    );
    const markup = renderView(
      createReadyState([completedDecision]),
      DATE,
      createCompletedCurrentDay(),
    );

    expect(markup).toContain('class="today-closed-metrics"');
    expect(markup).toContain('1 из 1');
    expect(markup).toContain('Не запланированы');
    expect(markup).toContain('>Сессии<');
    expect(markup).toContain('Не было');
    expect(markup).toContain('>Закрыт<');
    expect(markup).not.toContain('0 / 0');
  });

  it('учитывает отменённое Решение в общем количестве завершённого дня', () => {
    const cancelledDecision = cancelDecision(
      createPlannedDecision('closed-cancelled-metric', DATE, DECISION_KIND.main, 1),
    );
    const markup = renderView(
      createReadyState([cancelledDecision]),
      DATE,
      createCompletedCurrentDay(),
    );

    expect(markup).toContain('<dt>Решения</dt><dd>0 из 1</dd><small>выполнено</small>');
    expect(markup).not.toContain('<dt>Решения</dt><dd>0</dd><small>Не было</small>');
  });

  it('показывает решения закрытого дня нейтрально без декоративных номеров и команд создания', () => {
    const completed = confirmDecision(
      createPlannedDecision('closed-completed', DATE, DECISION_KIND.main, 1),
    );
    const active = markDecisionInProgress(
      createPlannedDecision('closed-active', DATE, DECISION_KIND.main, 2),
    );
    const cancelled = cancelDecision(
      createPlannedDecision('closed-cancelled', DATE, DECISION_KIND.main, 3),
    );
    const markup = renderView(
      createReadyState([completed, active, cancelled]),
      DATE,
      createCompletedCurrentDay(),
    );

    expect(markup).toContain('class="today-closed-decisions"');
    expect(markup).toContain('3 из 3');
    expect(markup).toContain('>Выполнено<');
    expect(markup).toContain('>В работе<');
    expect(markup).toContain('>Отменено<');
    expect(markup.match(/aria-label="Открыть решение/g)).toHaveLength(3);
    expect(markup).not.toContain('aria-label="Открыть меню решения');
    expect(markup).not.toContain('class="decision-order"');
    expect(markup).not.toContain('Фокус дня');
    expect(markup).not.toContain('Добавить главное решение');
  });

  it('не оставляет декоративную колонку у отменённого Решения и сохраняет галочку выполненному', () => {
    const completed = confirmDecision(
      createPlannedDecision('closed-icon-completed', DATE, DECISION_KIND.main, 1),
    );
    const cancelled = cancelDecision(
      createPlannedDecision('closed-icon-cancelled', DATE, DECISION_KIND.main, 2),
    );
    const markup = renderView(
      createReadyState([completed, cancelled]),
      DATE,
      createCompletedCurrentDay(),
    );
    const completedCard = markup.match(
      /<article class="today-closed-decision status-confirmed">[\s\S]*?<\/article>/,
    )?.[0];
    const cancelledCard = markup.match(
      /<article class="today-closed-decision status-cancelled">[\s\S]*?<\/article>/,
    )?.[0];

    expect(completedCard).toContain('d="m7 12.5 3.2 3.2L17.5 8.5"');
    expect(cancelledCard).not.toContain('d="M9 5h11M9 12h11M9 19h11"');
    expect(markup).not.toContain('class="today-closed-decision-icon"');
  });

  it('сохраняет структуру карточки при длинном названии и ожидаемом результате', () => {
    const longTitle = 'Завершить проектирование вечернего блока распорядка';
    const longResult =
      'Утверждена структура всех этапов и подготовлено техническое задание для дальнейшей реализации в LifeOS';
    const decision = createPlannedDecision('closed-long-content', DATE, DECISION_KIND.main, 1);
    decision.updateDetails({
      title: DecisionTitle.create(longTitle),
      expectedResult: ExpectedResult.create(longResult),
      occurredAt: new Date('2026-08-02T10:00:00.000+09:00'),
      eventId: EntityId.create('closed-long-content-updated'),
    });
    const markup = renderView(createReadyState([decision]), DATE, createCompletedCurrentDay());

    expect(markup).toContain(`>${longTitle}</button>`);
    expect(markup).toContain(`<span>${longResult}</span>`);
    expect(markup).toContain('>Запланировано</span>');
    expect(markup).toContain(`aria-label="Открыть решение «${longTitle}»"`);
  });

  it('объединяет пустые нижние состояния закрытого дня в компактные детали', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(markup).toContain('class="today-closed-details"');
    expect(markup).toContain('>Детали дня</h2>');
    expect(markup).toContain('>Дополнительные решения<');
    expect(markup).toContain('>Хронология<');
    expect(markup).toContain('0 записей');
    expect(markup).toContain('>Распорядок дня<');
    expect(markup).toContain('Не настроен');
    expect(markup).not.toContain('Пока дополнительных решений нет');
    expect(markup).not.toContain('Блоки дня пока не заданы');
  });

  it('раскрывает существующее содержимое деталей и показывает согласованные количества', () => {
    const additional = createPlannedDecision('closed-additional', DATE, DECISION_KIND.additional);
    const completedAction = completeLifeAction(createReadyLifeAction('closed-timeline', DATE));
    const completedSession = completeSession(createSession('closed-session', completedAction.id));
    const markup = renderView(createReadyState([additional]), DATE, createCompletedCurrentDay(), {
      currentLifeActions: [completedAction],
      currentDaySessions: [completedSession],
    });

    expect(markup).toContain('1 решение');
    expect(markup).toContain('2 записи');
    expect(markup).toContain('id="today-closed-timeline"');
    expect(markup).toContain('Решение closed-additional');
    expect(markup).toContain('Действие closed-timeline');
    expect(markup).toContain('Последняя сессия · 05:00');
  });

  it('согласует множественное число для длинного списка дополнительных решений', () => {
    const additionalDecisions = Array.from({ length: 5 }, (_, index) =>
      createPlannedDecision(`closed-additional-${index + 1}`, DATE, DECISION_KIND.additional),
    );
    const markup = renderView(
      createReadyState(additionalDecisions),
      DATE,
      createCompletedCurrentDay(),
    );

    expect(markup).toContain('5 решений');
  });

  it('оставляет в правой колонке только контекст закрытого дня без оценочной похвалы', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(markup).toContain('Посмотреть хронологию');
    expect(markup).toContain('aria-controls="today-closed-timeline"');
    expect(markup).not.toContain('href="#today-closed-timeline"');
    expect(markup).toContain('Открыть распорядок дня');
    expect(markup).toContain('Добавить действие на завтра');
    expect(markup).toContain('Активных напоминаний нет');
    expect(markup).not.toContain('Задать фокус');
    expect(markup).not.toContain('Настроить фокус');
    expect(markup).not.toContain('Вы молодец, всё под контролем');
  });

  it('не подменяет ошибки загрузки закрытого дня пустыми состояниями и предлагает повтор', () => {
    const loadingMarkup = renderView(
      { ...createReadyState([]), decisions: { status: 'loading' } },
      DATE,
      createCompletedCurrentDay(),
      { recoveryStatus: 'loading' },
    );
    const decisionsErrorMarkup = renderView(
      { ...createReadyState([]), decisions: { status: 'error' } },
      DATE,
      createCompletedCurrentDay(),
    );
    const recoveryErrorMarkup = renderView(
      createReadyState([]),
      DATE,
      createCompletedCurrentDay(),
      { recoveryStatus: 'error' },
    );

    expect(loadingMarkup).toContain('Загружаем решения…');
    expect(loadingMarkup).toContain('>Загрузка…<');
    expect(loadingMarkup).not.toContain('>0 записей<');
    expect(decisionsErrorMarkup).toContain('Решения временно недоступны.');
    expect(decisionsErrorMarkup).toContain('>Недоступны<');
    expect(decisionsErrorMarkup).toContain('>Повторить</button>');
    expect(recoveryErrorMarkup).toContain('>Недоступна<');
    expect(recoveryErrorMarkup).toContain('>Повторить</button>');
    expect(recoveryErrorMarkup).not.toContain('>0 записей<');
  });

  it('открывает подготовленный план завтра вместо повторного предложения подготовки', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay(), {
      tomorrowPlanSummary: { status: 'ready', prepared: true, mainDecisionCount: 3 },
    });

    expect(markup).toContain('План подготовлен');
    expect(markup).toContain('3 главных решения выбрано');
    expect(markup).toContain('>Открыть план</button>');
    expect(markup).not.toContain('>Подготовить план</button>');

    const emptyPreparedMarkup = renderView(
      createReadyState([]),
      DATE,
      createCompletedCurrentDay(),
      {
        tomorrowPlanSummary: { status: 'ready', prepared: true, mainDecisionCount: 0 },
      },
    );
    expect(emptyPreparedMarkup).toContain('0 главных решений выбрано');
  });

  it('даёт повторить загрузку состояния плана завтра после технической ошибки', () => {
    const markup = renderView(createReadyState([]), DATE, createCompletedCurrentDay(), {
      tomorrowPlanSummary: { status: 'error' },
    });

    expect(markup).toContain('Не удалось проверить состояние плана.');
    expect(markup).toContain('>Повторить</button>');
    expect(markup).not.toContain('>Открыть план</button>');
  });

  it('читает состояние плана завтра и считает только доступные главные решения', async () => {
    const first = createPlannedDecision('tomorrow-first', DATE, DECISION_KIND.main, 1);
    const second = createPlannedDecision('tomorrow-second', DATE, DECISION_KIND.main, 2);
    const cancelled = cancelDecision(
      createPlannedDecision('tomorrow-cancelled', DATE, DECISION_KIND.main, 3),
    );
    const additional = createPlannedDecision('tomorrow-additional', DATE, DECISION_KIND.additional);

    await expect(
      loadTomorrowPlanSummaryData({
        targetDate: DATE,
        getDecisionsForDate: {
          execute: async () => [first, second, cancelled, additional],
        },
        getPlanPrepared: async () => true,
      }),
    ).resolves.toEqual({ prepared: true, mainDecisionCount: 2 });
  });

  it('не подменяет доменный статус подготовки количеством решений', async () => {
    const decisions = [1, 2, 3].map((order) =>
      createPlannedDecision(`tomorrow-${order}`, DATE, DECISION_KIND.main, order),
    );

    await expect(
      loadTomorrowPlanSummaryData({
        targetDate: DATE,
        getDecisionsForDate: { execute: async () => decisions },
        getPlanPrepared: async () => false,
      }),
    ).resolves.toEqual({ prepared: false, mainDecisionCount: 3 });
  });

  it('показывает только корректно вычисляемые показатели и отличает отсутствие сессий от нуля', () => {
    const confirmed = confirmDecision(createPlannedDecision('metric-done', DATE));
    const planned = createPlannedDecision('metric-open', DATE, DECISION_KIND.additional);
    const completedAction = completeLifeAction(createReadyLifeAction('metric-action-done', DATE));
    const readyAction = createReadyLifeAction('metric-action-open', DATE);
    const withoutSessions = renderView(
      createReadyState([confirmed, planned]),
      DATE,
      createCurrentOpenDay(),
      { currentLifeActions: [completedAction, readyAction] },
    );
    const completed = completeSession(
      createSession(
        'metric-session',
        completedAction.id,
        new Date('2026-08-02T09:00:00.000+09:00'),
      ),
    );
    const withSession = renderView(
      createReadyState([confirmed, planned]),
      DATE,
      createCurrentOpenDay(),
      { currentLifeActions: [completedAction, readyAction], currentDaySessions: [completed] },
    );
    const runningSession = createSession(
      'metric-running-session',
      readyAction.id,
      new Date('2026-08-02T09:30:00.000+09:00'),
    );
    const withRunningSession = renderView(
      createReadyState([confirmed, planned]),
      DATE,
      createCurrentOpenDay(),
      {
        currentLifeActions: [completedAction, readyAction],
        currentDaySessions: [runningSession],
      },
    );

    expect(withoutSessions.match(/today-metric-value-current">1 \/ 2<\/span>/g)).toHaveLength(2);
    expect(withoutSessions).toContain(
      'today-metric-value-current">—</span></dd><small>Нет сессий</small>',
    );
    expect(withoutSessions).not.toContain('Прогресс дня');
    expect(withSession).toContain(
      'today-metric-value-current">05:00</span></dd><small>по сессиям</small>',
    );
    expect(withSession).toContain('aria-label="Сводка дня"');
    expect(withSession).toContain('Статус дня');
    expect(withRunningSession).toContain('today-metric-active-session');
    expect(withRunningSession).toContain('today-metric-status-dot');
    expect(withRunningSession).toContain('активная сессия');
  });

  it('строит спокойную хронологию завершённых Действий и Сессий и компактное пустое состояние', () => {
    const completedAction = completeLifeAction(createReadyLifeAction('timeline-action', DATE));
    const completed = completeSession(
      createSession(
        'timeline-session',
        completedAction.id,
        new Date('2026-08-02T08:00:00.000+09:00'),
      ),
    );
    const filledMarkup = renderView(createReadyState([]), DATE, createCompletedCurrentDay(), {
      currentLifeActions: [completedAction],
      currentDaySessions: [completed],
    });
    const emptyMarkup = renderView(createReadyState([]), DATE, createCompletedCurrentDay());

    expect(filledMarkup).toContain('Хронология');
    expect(filledMarkup).toContain('2 записи');
    expect(filledMarkup).toContain('Действие timeline-action');
    expect(filledMarkup).toContain('Последняя сессия · 05:00');
    expect(emptyMarkup).toContain('0 записей');
  });

  it('показывает загрузку и контролируемую ошибку чтения с повтором', () => {
    const loadingMarkup = renderView(INITIAL_TODAY_PAGE_STATE);
    const errorMarkup = renderView({
      ...INITIAL_TODAY_PAGE_STATE,
      decisions: { status: 'error' },
    });

    expect(loadingMarkup).toContain('Загружаем решения на выбранную дату…');
    expect(errorMarkup).toContain('Не удалось загрузить выбранный день');
    expect(errorMarkup).toContain('Повторить');
  });

  it('показывает существующие главные Решения компактным списком без карточек свободных мест', () => {
    const third = createPlannedDecision('третье', DATE, DECISION_KIND.main, 3);
    const first = createPlannedDecision('первое', DATE, DECISION_KIND.main, 1);
    const markup = renderView(createReadyState([third, first]));

    expect(markup).toContain('Главные решения');
    expect(markup.indexOf('Решение первое')).toBeLessThan(markup.indexOf('Решение третье'));
    expect(markup.match(/decision-order/g)).toHaveLength(2);
    expect(markup).not.toContain('Место свободно');
    expect(markup).toContain('Добавить главное решение');
    expect(markup).toContain('2 из 3');
    expect(markup).toContain('Запланировано');
  });

  it('для одного и трёх главных Решений правильно показывает оставшиеся места', () => {
    const first = createPlannedDecision('первое', DATE, DECISION_KIND.main, 1);
    const second = createPlannedDecision('второе', DATE, DECISION_KIND.main, 2);
    const third = createPlannedDecision('третье', DATE, DECISION_KIND.main, 3);
    const oneDecisionMarkup = renderView(createReadyState([first]));
    const fullMarkup = renderView(createReadyState([first, second, third]));

    expect(oneDecisionMarkup).toContain('Добавить главное решение');
    expect(oneDecisionMarkup).toContain('1 из 3');
    expect(fullMarkup).toContain('3 из 3');
    expect(fullMarkup).not.toContain('Добавить главное решение');
    expect(fullMarkup.match(/decision-order/g)).toHaveLength(3);
  });

  it('берёт название Решения из title и использует понятный резервный текст', () => {
    const titled = createPlannedDecision('названное', DATE, DECISION_KIND.main, 1);
    const untitled = createPlannedDecision('без-названия', DATE, DECISION_KIND.main, 2);
    Object.defineProperty(untitled, 'title', { value: undefined });
    const markup = renderView(createReadyState([titled, untitled]));

    expect(markup).toContain('Решение названное');
    expect(markup).toContain('Решение без названия');
  });

  it('показывает дополнительные решения и пустые состояния', () => {
    const emptyMarkup = renderView(createReadyState([]));
    const additional = createPlannedDecision('дополнительное', DATE, DECISION_KIND.additional);
    const filledMarkup = renderView(createReadyState([additional]));

    expect(emptyMarkup).toContain('Создать Решение');
    expect(emptyMarkup).not.toContain('Место свободно');
    expect(filledMarkup).toContain('Дополнительные решения');
    expect(filledMarkup).toContain('Решение дополнительное');
  });

  it('показывает компактную доступную форму и переключает обязательность результата для main/additional', () => {
    const opened = todayPageReducer(createReadyState([]), { type: 'open_form' });
    const mainMarkup = renderView(opened);
    const additional = todayPageReducer(opened, {
      type: 'kind_changed',
      kind: DECISION_KIND.additional,
    });
    const additionalMarkup = renderView(additional);

    expect(mainMarkup).toContain('Новое решение');
    expect(mainMarkup).toContain('Зафиксируйте результат, который хотите получить.');
    expect(mainMarkup).toContain('<fieldset class="decision-kind-field">');
    expect(mainMarkup.match(/type="radio"/g)).toHaveLength(2);
    expect(mainMarkup).toContain('name="decision-kind"');
    expect(mainMarkup).toContain('id="decision-title"');
    expect(mainMarkup).toContain('for="decision-title"');
    expect(mainMarkup).toContain('placeholder="Например: Завершить этап 17.2"');
    expect(mainMarkup).toContain('id="decision-expected-result"');
    expect(mainMarkup).toContain('for="decision-expected-result"');
    expect(mainMarkup).toContain('Что должно быть получено в результате?');
    expect(mainMarkup).toContain('Сформулируйте конкретный и проверяемый результат.');
    expect(mainMarkup).toContain(
      'Ожидаемый результат<span class="decision-required-mark"> *</span>',
    );
    expect(mainMarkup).toContain('aria-required="true"');
    expect(mainMarkup).toContain('Создать решение</span>');
    expect(mainMarkup).not.toContain('Все обязательные поля заполнены');
    expect(additionalMarkup).not.toContain('class="decision-required-mark"> *</span>');
    expect(additionalMarkup).toContain('aria-required="false"');
  });

  it('связывает ошибку с невалидным полем и блокирует действия во время создания', () => {
    const opened = todayPageReducer(createReadyState([]), { type: 'open_form' });
    const invalid = {
      ...opened,
      form: { ...opened.form, title: '' },
      formError: 'Введите название решения',
    } satisfies TodayPageState;
    const invalidExpectedResult = {
      ...opened,
      form: { ...opened.form, title: 'Решение', expectedResult: '' },
      formError: 'Укажите ожидаемый результат',
    } satisfies TodayPageState;
    const saving = { ...opened, isSaving: true } satisfies TodayPageState;
    const invalidMarkup = renderView(invalid);
    const invalidExpectedResultMarkup = renderView(invalidExpectedResult);
    const savingMarkup = renderView(saving);

    expect(invalidMarkup).toContain('id="decision-title"');
    expect(invalidMarkup).toContain('aria-invalid="true"');
    expect(invalidMarkup).toContain('aria-describedby="decision-form-error"');
    expect(invalidMarkup).toContain(
      'id="decision-expected-result" maxLength="1000" rows="3" required="" aria-required="true" aria-invalid="false"',
    );
    expect(invalidMarkup).toContain('id="decision-form-error" class="form-error" role="alert"');
    expect(invalidExpectedResultMarkup).toContain(
      'aria-describedby="decision-expected-result-help decision-form-error"',
    );
    expect(savingMarkup).toContain('Создание…');
    expect(savingMarkup).toContain('aria-busy="true"');
    expect(savingMarkup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('проверяет обязательные поля понятными сообщениями', () => {
    expect(
      validateDecisionForm({ kind: DECISION_KIND.main, title: ' ', expectedResult: 'Результат' }),
    ).toBe('Введите название решения');
    expect(
      validateDecisionForm({ kind: DECISION_KIND.main, title: 'Решение', expectedResult: ' ' }),
    ).toBe('Укажите ожидаемый результат');
    expect(
      validateDecisionForm({
        kind: DECISION_KIND.additional,
        title: 'Решение',
        expectedResult: '',
      }),
    ).toBeNull();
  });

  it('после успешного создания повторно загружает решения', async () => {
    const created = createPlannedDecision('новое', DATE, DECISION_KIND.main, 1);
    const createExecute = vi.fn().mockResolvedValue(success(created));
    const getExecute = vi.fn().mockResolvedValue([created]);

    const result = await createDecisionAndReload({
      selectedDate: DATE,
      form: {
        kind: DECISION_KIND.main,
        title: 'Новое решение',
        expectedResult: 'Новый результат',
      },
      createDecisionForDate: { execute: createExecute },
      getDecisionsForDate: { execute: getExecute },
    });

    expect(result).toEqual({ ok: true, decisions: [created] });
    expect(createExecute).toHaveBeenCalledOnce();
    expect(createExecute).toHaveBeenCalledWith({
      title: 'Новое решение',
      kind: DECISION_KIND.main,
      plannedDate: DATE,
      expectedResult: 'Новый результат',
    });
    expect(getExecute).toHaveBeenCalledWith(DATE);
  });

  it('показывает сохранение и блокирует кнопки повторной отправки', () => {
    const state: TodayPageState = {
      ...createReadyState([]),
      isFormOpen: true,
      isSaving: true,
    };
    const markup = renderView(state);

    expect(markup).toContain('Создание…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('показывает main_limit_reached и сохраняет введённые данные', async () => {
    const createExecute = vi
      .fn()
      .mockResolvedValue(
        failure(
          new DomainError(
            'decision.main_limit_reached',
            'На дату уже назначены три главных решения.',
          ),
        ),
      );
    const getExecute = vi.fn();
    const form = {
      kind: DECISION_KIND.main,
      title: 'Четвёртое решение',
      expectedResult: 'Результат остаётся',
    } as const;

    const result = await createDecisionAndReload({
      selectedDate: DATE,
      form,
      createDecisionForDate: { execute: createExecute },
      getDecisionsForDate: { execute: getExecute },
    });
    const failedState = todayPageReducer(
      { ...createReadyState([]), isFormOpen: true, form },
      {
        type: 'save_failed',
        message: result.ok ? '' : result.message,
      },
    );

    expect(result).toEqual({
      ok: false,
      message: 'На выбранную дату уже назначены три главных решения',
    });
    expect(failedState.form).toBe(form);
    expect(renderView(failedState)).toContain('Результат остаётся');
    expect(getExecute).not.toHaveBeenCalled();
  });

  it('успех очищает форму, а отмена закрывает её', () => {
    const filled: TodayPageState = {
      ...createReadyState([]),
      isFormOpen: true,
      form: {
        kind: DECISION_KIND.additional,
        title: 'Введённое решение',
        expectedResult: 'Введённый результат',
      },
    };

    const succeeded = todayPageReducer(filled, { type: 'save_succeeded' });
    const cancelled = todayPageReducer(filled, { type: 'close_form' });

    expect(succeeded.isFormOpen).toBe(false);
    expect(succeeded.form).toEqual({ kind: DECISION_KIND.main, title: '', expectedResult: '' });
    expect(cancelled.isFormOpen).toBe(false);
  });

  it('показывает навигацию, относительные заголовки и русскую дату выбранного дня', () => {
    const todayMarkup = renderView(createReadyState([]));
    const tomorrowMarkup = renderView(createReadyState([]), DayDate.create('2026-08-03'));
    const yesterdayMarkup = renderView(createReadyState([]), DayDate.create('2026-08-01'));
    const otherMarkup = renderView(createReadyState([]), DayDate.create('2026-08-08'));

    expect(todayMarkup).toContain('aria-label="Открыть предыдущий день"');
    expect(todayMarkup).toContain('aria-label="Открыть следующий день"');
    expect(todayMarkup).toContain('Выбрать дату');
    expect(todayMarkup).toContain('type="date"');
    expect(todayMarkup).toContain(
      'class="secondary-button lifeos-motion-outline today-plan-next-button"',
    );
    expect(todayMarkup).toContain(
      'class="date-picker-label lifeos-motion-outline today-calendar-button"',
    );
    expect(todayMarkup).toContain('Сегодня');
    expect(tomorrowMarkup).toContain('<h1>Завтра</h1>');
    expect(yesterdayMarkup).toContain('<h1>Вчера</h1>');
    expect(otherMarkup).toContain('<h1>8 августа 2026</h1>');
    expect(otherMarkup).toContain('Суббота');
  });

  it('показывает прошлый день только для просмотра и будущее пустое состояние', () => {
    const pastMarkup = renderView(createReadyState([]), DayDate.create('2026-08-01'));
    const futureMarkup = renderView(createReadyState([]), DayDate.create('2026-08-09'));

    expect(pastMarkup).toContain('Прошедший день доступен только для просмотра');
    expect(pastMarkup).toContain('На этот день решений не было');
    expect(pastMarkup).toContain('Количество решений: 0');
    expect(pastMarkup).toContain('Следующий день');
    expect(pastMarkup).toContain('Вернуться к сегодня');
    expect(pastMarkup).not.toContain('>Создать решение</button>');
    expect(futureMarkup).toContain('На этот день решения ещё не запланированы');
    expect(futureMarkup).toContain('Планировать 3 августа');
    expect(futureMarkup).toContain('>Создать Решение</button>');
    expect(futureMarkup.match(/9 августа 2026/g)).toHaveLength(1);
  });

  it('скрывает редактирование и создание действия в карточке прошедшего решения', () => {
    const pastDate = DayDate.create('2026-08-01');
    const decision = createPlannedDecision('прошедшее', pastDate);
    const markup = renderView(createDetailsState(decision), pastDate);

    expect(markup).not.toContain('>Редактировать</button>');
    expect(markup).not.toContain('>Создать действие</button>');
    expect(markup).toContain('>Перенести</button>');
    expect(markup).toContain('>Отменить решение</button>');
  });

  it('создаёт решение именно на выбранную будущую дату', async () => {
    const selectedDate = DayDate.create('2026-08-09');
    const created = createPlannedDecision('будущее', selectedDate, DECISION_KIND.additional);
    const createExecute = vi.fn().mockResolvedValue(success(created));
    const getExecute = vi.fn().mockResolvedValue([created]);

    const result = await createDecisionAndReload({
      selectedDate,
      form: {
        kind: DECISION_KIND.additional,
        title: 'Будущее решение',
        expectedResult: '',
      },
      createDecisionForDate: { execute: createExecute },
      getDecisionsForDate: { execute: getExecute },
    });

    expect(result).toEqual({ ok: true, decisions: [created] });
    expect(createExecute).toHaveBeenCalledWith({
      title: 'Будущее решение',
      kind: DECISION_KIND.additional,
      plannedDate: selectedDate,
    });
    expect(getExecute).toHaveBeenCalledWith(selectedDate);
  });

  it('закрывает карточки, формы и ошибки при смене выбранной даты', () => {
    const decision = createPlannedDecision('открытое', DATE);
    const changed = todayPageReducer(
      {
        ...createDetailsState(decision),
        isFormOpen: true,
        formError: 'Ошибка старого дня',
        decisionRescheduleNotice: 'Старое уведомление',
      },
      { type: 'selected_date_changed' },
    );

    expect(changed).toEqual(INITIAL_TODAY_PAGE_STATE);
  });

  it('не принимает устаревший ответ после быстрого переключения дат', async () => {
    const oldDate = DayDate.create('2026-08-03');
    const newDate = DayDate.create('2026-08-04');
    const oldDecision = createPlannedDecision('старый ответ', oldDate);
    const newDecision = createPlannedDecision('новый ответ', newDate);
    let selectedDate = oldDate;
    let resolveOld!: (decisions: readonly Decision[]) => void;
    const execute = vi.fn((date: DayDate): Promise<readonly Decision[]> => {
      if (date.equals(oldDate)) {
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }

      return Promise.resolve([newDecision]);
    });

    const oldLoad = loadSelectedDateDecisions({
      selectedDate: oldDate,
      getDecisionsForDate: { execute },
      isCurrent: () => selectedDate.equals(oldDate),
    });
    selectedDate = newDate;
    const newLoad = await loadSelectedDateDecisions({
      selectedDate: newDate,
      getDecisionsForDate: { execute },
      isCurrent: () => selectedDate.equals(newDate),
    });
    resolveOld([oldDecision]);

    await expect(oldLoad).resolves.toEqual({ status: 'stale' });
    expect(newLoad).toEqual({ status: 'succeeded', decisions: [newDecision] });
  });

  it('renders main and additional decisions as native keyboard-accessible buttons', () => {
    const main = createPlannedDecision('main-open', DATE, DECISION_KIND.main, 1);
    const additional = createPlannedDecision('additional-open', DATE, DECISION_KIND.additional);

    const markup = renderView(createReadyState([main, additional]));

    expect(markup).toContain('decision-card-button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Открыть решение');
    expect(markup.match(/decision-open-hint/g)).toHaveLength(2);
    expect(isDecisionActivationKey('Enter')).toBe(true);
    expect(isDecisionActivationKey(' ')).toBe(true);
    expect(isDecisionActivationKey('Escape')).toBe(false);
  });

  it('показывает компактный Project-контекст решения в плане дня', () => {
    const project = Project.create({
      id: EntityId.create('today-project'),
      title: 'Интеграция Дня',
      now: new Date('2026-08-02T08:00:00.000+09:00'),
    });
    const decision = createPlannedDecision(
      'project-decision',
      DATE,
      DECISION_KIND.main,
      1,
      project.id,
    );

    const markup = renderView(createReadyState([decision]), DATE, createCurrentPlannedDay(), {
      projects: [project],
    });

    expect(markup).toContain('decision-project-link');
    expect(markup).toContain('Интеграция Дня');
    expect(markup).toContain('aria-label="Открыть решение');
  });

  it('shows decision details for both kinds and no internal identifiers', () => {
    const main = createPlannedDecision('main-details', DATE, DECISION_KIND.main, 2);
    const additional = createPlannedDecision('additional-details', DATE, DECISION_KIND.additional);
    const mainMarkup = renderView(createDetailsState(main));
    const additionalMarkup = renderView(createDetailsState(additional));

    expect(mainMarkup).toContain('Главное решение');
    expect(mainMarkup).toContain('Позиция');
    expect(mainMarkup).toContain('Запланировано');
    expect(additionalMarkup).toContain('Дополнительное решение');
    expect(additionalMarkup).not.toContain('<dt>Позиция</dt>');
    expect(mainMarkup).not.toContain('data-decision-id');
    expect(mainMarkup).not.toContain('main-details-draft-event');
    expect(mainMarkup).not.toContain('decision.not_found');
  });

  it('shows details loading, controlled error with retry, and closes the panel', () => {
    const decision = createPlannedDecision('details-state', DATE);
    const loading = todayPageReducer(createReadyState([decision]), {
      type: 'details_load_started',
      decisionId: decision.id,
    });
    const failed = todayPageReducer(loading, {
      type: 'details_load_failed',
      decisionId: decision.id,
    });
    const closed = todayPageReducer(failed, { type: 'details_closed' });

    expect(renderView(loading)).toContain('Загружаем решение…');
    expect(renderView(failed)).toContain('Не удалось открыть решение');
    expect(renderView(failed)).toContain('Повторить');
    expect(renderView(failed)).toContain('Закрыть карточку решения');
    expect(renderView(closed)).not.toContain('decision-details-backdrop');
  });

  it('shows an empty linked-action state and existing linked actions', () => {
    const decision = createPlannedDecision('linked-actions', DATE);
    const emptyMarkup = renderView(createDetailsState(decision));
    const lifeAction = createReadyLifeAction('linked-ready', DATE, {
      decisionId: decision.id,
    });
    const filledMarkup = renderView(createDetailsState(decision, [lifeAction]));

    expect(emptyMarkup).toContain('Для этого решения пока нет действий');
    expect(filledMarkup).toContain('Действия по решению');
    expect(filledMarkup).toContain('Готово к выполнению');
    expect(filledMarkup).toContain('Результат linked-ready');
  });

  it('opens the action form, validates required fields, and cancellation closes it', () => {
    const decision = createPlannedDecision('action-form', DATE);
    const details = createDetailsState(decision);
    const opened = todayPageReducer(details, { type: 'life_action_form_opened' });
    const closed = todayPageReducer(opened, { type: 'life_action_form_closed' });

    expect(renderView(opened)).toContain('Название действия *');
    expect(renderView(opened)).toContain('Ожидаемый результат *');
    expect(renderView(opened)).toContain('Описание');
    expect(
      validateLifeActionForm({ title: ' ', expectedResult: 'Результат', description: '' }),
    ).toBe('Введите название действия');
    expect(
      validateLifeActionForm({ title: 'Действие', expectedResult: ' ', description: '' }),
    ).toBe('Укажите ожидаемый результат');
    expect(closed.isLifeActionFormOpen).toBe(false);
  });

  it('creates a linked action and reloads the list for the same decision', async () => {
    const decision = createPlannedDecision('create-linked', DATE);
    const created = createReadyLifeAction('created-linked', DATE, {
      decisionId: decision.id,
    });
    const createExecute = vi.fn().mockResolvedValue(success(created));
    const getExecute = vi.fn().mockResolvedValue([created]);
    const form = {
      title: 'Новое действие',
      expectedResult: 'Новый результат',
      description: 'Подробности',
    } as const;

    const result = await createLifeActionAndReload({
      decisionId: decision.id,
      plannedDate: DATE,
      form,
      createLifeActionForDecision: { execute: createExecute },
      getLifeActionsForDecision: { execute: getExecute },
    });

    expect(result).toEqual({ ok: true, lifeAction: created, lifeActions: [created] });
    expect(createExecute).toHaveBeenCalledWith({
      decisionId: decision.id,
      title: 'Новое действие',
      expectedResult: 'Новый результат',
      plannedDate: DATE,
      description: 'Подробности',
    });
    expect(getExecute).toHaveBeenCalledWith(decision.id);
  });

  it('blocks repeated action submission and clears the form after success', () => {
    const decision = createPlannedDecision('saving-action', DATE);
    const filled = {
      ...createDetailsState(decision),
      isLifeActionFormOpen: true,
      isLifeActionSaving: true,
      lifeActionForm: {
        title: 'Введённое действие',
        expectedResult: 'Введённый результат',
        description: 'Описание остаётся',
      },
    } satisfies TodayPageState;
    const markup = renderView(filled);
    const succeeded = todayPageReducer(filled, {
      type: 'life_action_save_succeeded',
      decisionId: decision.id,
      lifeActions: [],
    });

    expect(markup).toContain('Создаём…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(succeeded.isLifeActionFormOpen).toBe(false);
    expect(succeeded.lifeActionForm).toEqual({ title: '', expectedResult: '', description: '' });
  });

  it('preserves entered action data and hides internal error codes after failure', async () => {
    const decision = createPlannedDecision('failed-action', DATE);
    const form = {
      title: 'Данные остаются',
      expectedResult: 'Результат остаётся',
      description: 'Описание остаётся',
    } as const;
    const createExecute = vi
      .fn()
      .mockResolvedValue(
        failure(
          new DomainError('action.decision_unavailable', 'Internal message that must not be shown'),
        ),
      );
    const result = await createLifeActionAndReload({
      decisionId: decision.id,
      plannedDate: DATE,
      form,
      createLifeActionForDecision: { execute: createExecute },
      getLifeActionsForDecision: { execute: vi.fn() },
    });
    const failed = todayPageReducer(
      { ...createDetailsState(decision), isLifeActionFormOpen: true, lifeActionForm: form },
      { type: 'life_action_save_failed', message: result.ok ? '' : result.message },
    );
    const markup = renderView(failed);

    expect(failed.lifeActionForm).toBe(form);
    expect(markup).toContain('Для этого решения больше нельзя создавать действия');
    expect(markup).not.toContain('action.decision_unavailable');
    expect(markup).not.toContain('Internal message');
  });

  it('renders linked actions as native buttons activated by Enter and Space', () => {
    const decision = createPlannedDecision('open-action', DATE);
    const action = createReadyLifeAction('keyboard-action', DATE, { decisionId: decision.id });
    const markup = renderView(createDetailsState(decision, [action]));

    expect(markup).toContain('linked-action-card-button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Открыть действие');
    expect(isLifeActionActivationKey('Enter')).toBe(true);
    expect(isLifeActionActivationKey(' ')).toBe(true);
    expect(isLifeActionActivationKey('Escape')).toBe(false);
  });

  it('показывает количества действий по состояниям', () => {
    const decision = createPlannedDecision('result-counts', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('completed-count', DATE, { decisionId: decision.id }),
      ),
    );
    const ready = createReadyLifeAction('ready-count', DATE, { decisionId: decision.id });
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-count', DATE, { decisionId: decision.id }),
    );
    const markup = renderView(createDetailsState(decision, [completed, ready, cancelled]));

    expect(markup).toContain('<dt>Завершено</dt><dd>1</dd>');
    expect(markup).toContain('<dt>Не завершено</dt><dd>1</dd>');
    expect(markup).toContain('<dt>Отменено</dt><dd>1</dd>');
  });

  it('без completed-действий блокирует подтверждение и объясняет причину', () => {
    const decision = createPlannedDecision('no-completed-ui', DATE);
    const markup = renderView(createDetailsState(decision));

    expect(markup).toContain(
      'Решение остаётся активным: для подтверждения нужен хотя бы один проверенный результат завершённого действия.',
    );
    expect(markup).toContain('decision-confirm-button" type="button" disabled=""');
  });

  it('unfinished-действие блокирует подтверждение', () => {
    const decision = createPlannedDecision('unfinished-ui', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('done-ui', DATE, { decisionId: decision.id })),
    );
    const ready = createReadyLifeAction('ready-ui', DATE, { decisionId: decision.id });
    const markup = renderView(createDetailsState(decision, [completed, ready]));

    expect(markup).toContain(
      'Решение остаётся активным: завершите все текущие действия, прежде чем подтверждать общий результат.',
    );
    expect(markup).toContain('decision-confirm-button" type="button" disabled=""');
  });

  it('completed-действие разрешает подтверждение, а cancelled его не блокирует', () => {
    const decision = createPlannedDecision('available-ui', DATE);
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('done-available', DATE, { decisionId: decision.id }),
      ),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-available', DATE, { decisionId: decision.id }),
    );
    const markup = renderView(createDetailsState(decision, [completed, cancelled]));

    expect(markup).toContain('Подтвердить решение результатами действий');
    expect(markup).not.toContain('decision-confirm-button" type="button" disabled=""');
    expect(markup).not.toContain(
      'Решение остаётся активным: завершите все текущие действия, прежде чем подтверждать общий результат.',
    );
  });

  it('открывает и закрывает форму подтверждения', () => {
    const decision = createPlannedDecision('confirmation-form', DATE);
    const initial = createDetailsState(decision);
    const opened = todayPageReducer(initial, { type: 'decision_confirmation_form_opened' });
    const closed = todayPageReducer(opened, { type: 'decision_confirmation_form_closed' });

    expect(renderView(opened)).toContain('Подтверждение решения');
    expect(renderView(opened)).toContain('Фактический результат решения *');
    expect(renderView(opened)).toContain(
      'Проверьте общий итог. Завершённые действия будут зафиксированы как доказательства результата решения.',
    );
    expect(closed.isDecisionConfirmationFormOpen).toBe(false);
  });

  it('проверяет обязательность actualResult', () => {
    expect(validateDecisionConfirmationForm({ actualResult: '   ' })).toBe(
      'Укажите фактический результат решения',
    );
    expect(validateDecisionConfirmationForm({ actualResult: 'Факт' })).toBeNull();
  });

  it('блокирует повторную отправку формы подтверждения', () => {
    const decision = createPlannedDecision('confirmation-saving', DATE);
    const state = {
      ...createDetailsState(decision),
      isDecisionConfirmationFormOpen: true,
      isDecisionConfirming: true,
      decisionConfirmationForm: { actualResult: 'Сохраняемый факт' },
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('Подтверждаем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('успешное подтверждение обновляет карточку без F5 и очищает форму', () => {
    const planned = createPlannedDecision('confirmation-success', DATE);
    const confirmed = confirmDecision(planned);
    const state = {
      ...createDetailsState(planned),
      isDecisionConfirmationFormOpen: true,
      decisionConfirmationForm: { actualResult: 'Введённый факт' },
      isLifeActionFormOpen: true,
    } satisfies TodayPageState;

    const succeeded = todayPageReducer(state, {
      type: 'decision_confirmation_succeeded',
      decision: confirmed,
    });

    expect(succeeded.details.status).toBe('ready');
    if (succeeded.details.status === 'ready') {
      expect(succeeded.details.decision).toBe(confirmed);
    }
    expect(succeeded.isDecisionConfirmationFormOpen).toBe(false);
    expect(succeeded.decisionConfirmationForm.actualResult).toBe('');
    expect(succeeded.isLifeActionFormOpen).toBe(false);
  });

  it('показывает итог подтверждённого решения без внутренних evidenceIds', () => {
    const decision = confirmDecision(createPlannedDecision('confirmed-ui', DATE));
    const completed = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('confirmed-action', DATE, { decisionId: decision.id }),
      ),
    );
    const markup = renderView(createDetailsState(decision, [completed]));

    expect(markup).toContain('Решение подтверждено');
    expect(markup).toContain('Результат подтверждён');
    expect(markup).toContain('Действий в подтверждении');
    expect(markup).toContain('Завершённые действия');
    expect(markup).toContain('Действие confirmed-action');
    expect(markup).not.toContain('confirmed-ui-evidence');
  });

  it('после confirmed скрывает создание действия и повторное подтверждение', () => {
    const decision = confirmDecision(createPlannedDecision('final-ui', DATE));
    const markup = renderView(createDetailsState(decision));

    expect(markup).not.toContain('Создать действие');
    expect(markup).not.toContain('Подтвердить решение результатами действий');
  });

  it('при ошибке сохраняет введённый actualResult и не показывает внутренний код', () => {
    const decision = createPlannedDecision('failed-confirmation', DATE);
    const filled = {
      ...createDetailsState(decision),
      isDecisionConfirmationFormOpen: true,
      decisionConfirmationForm: { actualResult: 'Текст должен остаться' },
    } satisfies TodayPageState;
    const failed = todayPageReducer(filled, {
      type: 'decision_confirmation_failed',
      message: decisionConfirmationErrorMessage('decision.actions_unfinished'),
    });
    const markup = renderView(failed);

    expect(failed.decisionConfirmationForm.actualResult).toBe('Текст должен остаться');
    expect(markup).toContain(
      'Завершите все текущие действия, прежде чем подтверждать общий результат',
    );
    expect(markup).not.toContain('decision.actions_unfinished');
  });

  it('вызывает ConfirmDecisionFromActions и возвращает сущность команды', async () => {
    const decision = confirmDecision(createPlannedDecision('workflow-confirmation', DATE));
    const execute = vi.fn().mockResolvedValue(success(decision));

    const result = await confirmDecisionResult({
      decisionId: decision.id,
      form: { actualResult: 'Фактический итог' },
      confirmDecisionFromActions: { execute },
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({
      decisionId: decision.id,
      actualResult: 'Фактический итог',
    });
  });

  it('показывает редактирование только для planned и безопасную отмену для активных решений', () => {
    const planned = createPlannedDecision('management-planned', DATE);
    const inProgress = markDecisionInProgress(createPlannedDecision('management-progress', DATE));
    const confirmed = confirmDecision(createPlannedDecision('management-confirmed', DATE));

    const plannedMarkup = renderView(createDetailsState(planned));
    const progressMarkup = renderView(createDetailsState(inProgress));
    const confirmedMarkup = renderView(createDetailsState(confirmed));

    expect(plannedMarkup).toContain('Редактировать');
    expect(plannedMarkup).toContain('>Перенести<');
    expect(plannedMarkup).toContain('Отменить решение');
    expect(progressMarkup).not.toContain('Редактировать');
    expect(progressMarkup).toContain('>Перенести<');
    expect(progressMarkup).toContain('Отменить решение');
    expect(confirmedMarkup).not.toContain('Редактировать');
    expect(confirmedMarkup).not.toContain('>Перенести<');
    expect(confirmedMarkup).not.toContain('Отменить решение');
  });

  it('открывает компактную форму переноса с датой, позицией и быстрыми вариантами', () => {
    const decision = createPlannedDecision('reschedule-form', DATE, DECISION_KIND.main, 2);
    const ready = createReadyLifeAction('reschedule-ready', DATE, { decisionId: decision.id });
    const completed = completeLifeAction(
      createReadyLifeAction('reschedule-completed', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('reschedule-cancelled', DATE, { decisionId: decision.id }),
    );
    const opened = todayPageReducer(createDetailsState(decision, [ready, completed, cancelled]), {
      type: 'decision_reschedule_form_opened',
    });
    const tomorrow = todayPageReducer(opened, {
      type: 'decision_reschedule_date_changed',
      newPlannedDate: '2026-08-03',
    });
    const markup = renderView(tomorrow);
    const closed = todayPageReducer(tomorrow, { type: 'decision_reschedule_form_closed' });

    expect(markup).toContain('Перенос решения');
    expect(markup).toContain('Текущая дата решения');
    expect(markup).toContain('2 августа 2026 г.');
    expect(markup).toContain('Текущая позиция');
    expect(markup).toContain('>2<');
    expect(markup).toContain('Следующий день');
    expect(markup).toContain('Через неделю');
    expect(markup).toContain('value="2026-08-03"');
    expect(markup).toContain('Незавершённая работа переносится вместе с решением одной операцией');
    expect(markup).toContain('На новой дате решение займёт свободную позицию автоматически');
    expect(renderView(closed)).not.toContain('Перенос решения');
  });

  it('показывает перенос незавершённых действий и сохранение исторических результатов', () => {
    const decision = createPlannedDecision('reschedule-actions', DATE);
    const draft = createLifeActionDraft('reschedule-draft', { decisionId: decision.id });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('reschedule-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('reschedule-completed', DATE, { decisionId: decision.id }),
    );
    const state = {
      ...createDetailsState(decision, [draft, inProgress, completed]),
      isDecisionRescheduleFormOpen: true,
      decisionRescheduleForm: {
        newPlannedDate: '2026-08-03',
        reason: 'Нужно продолжить в отдельный день',
      },
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('Будет перенесено');
    expect(markup).toContain('Черновики останутся связаны');
    expect(markup).toContain('Завершено в истории');
    expect(markup).not.toContain('Сначала завершите настройку');
  });

  it('сохраняет дату при ошибке, блокирует повторную отправку и переводит коды в сообщения', async () => {
    const decision = createPlannedDecision('reschedule-failed', DATE);
    const form = { newPlannedDate: '2026-08-01', reason: 'Нужен дополнительный день' };
    const execute = vi
      .fn()
      .mockResolvedValue(
        failure(new DomainError('decision.planned_date_in_past', 'internal decision error')),
      );
    const result = await rescheduleDecisionResult({
      decisionId: decision.id,
      expectedVersion: decision.version,
      form,
      rescheduleDecisionSafely: { execute },
    });
    const pending = {
      ...createDetailsState(decision),
      isDecisionRescheduleFormOpen: true,
      isDecisionRescheduling: true,
      decisionRescheduleForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'decision_reschedule_failed',
      message: result.ok ? '' : result.message,
    });

    expect(validateDecisionRescheduleForm({ newPlannedDate: ' ', reason: '' })).toBe(
      'Выберите новую дату',
    );
    expect(validateDecisionRescheduleForm({ newPlannedDate: '2026-08-03', reason: ' ' })).toBe(
      'Укажите причину переноса',
    );
    expect(renderView(pending)).toContain('Переносим…');
    expect(renderView(pending).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
    expect(failed.decisionRescheduleForm).toBe(form);
    expect(renderView(failed)).toContain('value="2026-08-01"');
    expect(renderView(failed)).toContain('Нельзя перенести решение на прошедшую дату');
    expect(renderView(failed)).not.toContain('decision.planned_date_in_past');
    expect(decisionRescheduleErrorMessage('decision.main_limit_reached')).toBe(
      'На выбранную дату уже назначены три главных решения',
    );
    expect(decisionRescheduleErrorMessage('decision.session_unfinished')).toBe(
      'Сначала завершите активную или приостановленную рабочую сессию',
    );
    expect(decisionRescheduleErrorMessage('decision.cannot_reschedule')).toBe(
      'Это решение уже нельзя переносить',
    );
  });

  it('успешный перенос удаляет решение с текущего дня, закрывает панель и не создаёт дубликат', async () => {
    const current = createPlannedDecision('reschedule-success', DATE, DECISION_KIND.main, 3);
    const newDate = DayDate.create('2026-08-03');
    const updated = createPlannedDecision('reschedule-success', DATE, DECISION_KIND.main, 3);
    updated.clearUncommittedEvents();
    updated.reschedule(
      newDate,
      'Нужно перенести работу',
      new Date('2026-08-02T12:00:00.000+09:00'),
      EntityId.create('decision-ui-rescheduled-event'),
      1,
    );
    const execute = vi.fn().mockResolvedValue(success(updated));
    const result = await rescheduleDecisionResult({
      decisionId: current.id,
      expectedVersion: current.version,
      form: { newPlannedDate: newDate.toString(), reason: 'Нужно перенести работу' },
      rescheduleDecisionSafely: { execute },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected rescheduled Decision');
    }
    const succeeded = todayPageReducer(
      {
        ...createDetailsState(current),
        isDecisionRescheduleFormOpen: true,
        decisionRescheduleForm: {
          newPlannedDate: newDate.toString(),
          reason: 'Нужно перенести работу',
        },
      },
      {
        type: 'decision_reschedule_succeeded',
        decision: result.decision,
        movedOffCurrentDay: true,
        message: 'Решение перенесено на 3 августа 2026 г.',
      },
    );
    const markup = renderView(succeeded);

    expect(succeeded.details.status).toBe('closed');
    expect(succeeded.decisions.status === 'ready' && succeeded.decisions.decisions).toHaveLength(0);
    expect(markup).not.toContain('Решение reschedule-success');
    expect(markup).toContain('Решение перенесено на 3 августа 2026 г.');
    expect(execute).toHaveBeenCalledWith({
      decisionId: current.id,
      expectedVersion: current.version,
      newPlannedDate: '2026-08-03',
      reason: 'Нужно перенести работу',
    });
  });

  it('идемпотентный перенос сохраняет панель и список без ложного сообщения', () => {
    const decision = createPlannedDecision('reschedule-same', DATE);
    const state = createDetailsState(decision);
    const succeeded = todayPageReducer(state, {
      type: 'decision_reschedule_succeeded',
      decision,
      movedOffCurrentDay: false,
      message: null,
    });

    expect(succeeded.details.status).toBe('ready');
    expect(succeeded.decisions.status === 'ready' && succeeded.decisions.decisions).toEqual([
      decision,
    ]);
    expect(succeeded.decisionRescheduleNotice).toBeNull();
  });

  it('открывает полную предзаполненную форму редактирования с версией и неизменяемой датой', () => {
    const decision = createPlannedDecision('edit-form', DATE);
    decision.updateDetails({
      reason: 'Причина решения',
      sphereId: EntityId.create('sphere-development'),
      price: 'Два часа',
      sacrifices: 'Не отвлекаться',
      priority: DECISION_PRIORITY.high,
      projectReference: 'LifeOS',
      occurredAt: new Date('2026-08-02T09:00:00.000+09:00'),
      eventId: EntityId.create('edit-form-details-event'),
    });
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const markup = renderView(opened);

    expect(opened.decisionEditForm).toEqual({
      title: 'Решение edit-form',
      reason: 'Причина решения',
      expectedResult: 'Результат edit-form',
      sphereId: 'sphere-development',
      price: 'Два часа',
      sacrifices: 'Не отвлекаться',
      projectReference: 'LifeOS',
      projectId: '',
      kind: DECISION_KIND.main,
      priority: DECISION_PRIORITY.high,
      expectedVersion: decision.version,
    });
    expect(markup).toContain('Редактирование решения');
    expect(markup).toContain(`Версия ${decision.version}`);
    expect(markup).toContain('Дата решения:');
    expect(markup).toContain('Перенос выполняется отдельной командой');
    expect(markup).toContain('Вид решения');
    expect(markup).toContain('Приоритет');
    expect(markup).toContain('value="Решение edit-form"');
    expect(markup).toContain('Причина решения');
    expect(markup).toContain('Результат edit-form');
    expect(markup).toContain('Разработка');
    expect(markup).toContain('LifeOS');
    expect(markup).toContain('Два часа');
    expect(markup).toContain('Не отвлекаться');
    expect(markup).toContain('Ожидаемый результат *');
    expect(
      validateDecisionEditForm({ title: ' ', expectedResult: 'Результат' }, decision.kind),
    ).toBe('Введите название решения');
    expect(validateDecisionEditForm({ title: 'Решение', expectedResult: ' ' }, decision.kind)).toBe(
      'Укажите ожидаемый результат',
    );
    expect(
      validateDecisionEditForm({ title: 'Решение', expectedResult: '' }, DECISION_KIND.additional),
    ).toBeNull();
  });

  it('после начала показывает режим уточнения и блокирует плановые поля', () => {
    const decision = markDecisionInProgress(createPlannedDecision('edit-started', DATE));
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const markup = renderView(opened);

    expect(markup).toContain('Уточнение решения');
    expect(markup).toContain('Можно уточнить причину, ожидаемый результат, цену и жертвы');
    expect(markup).toContain('Формулировка, вид, сфера, приоритет и проект зафиксированы');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(markup).not.toContain('>Перенести<');
  });

  it('передаёт в прикладную команду все поля и ожидаемую версию', async () => {
    const decision = createPlannedDecision('edit-complete-input', DATE);
    const execute = vi.fn().mockResolvedValue(success(decision));
    const form = {
      title: 'Обновлённое решение',
      reason: 'Новая причина',
      expectedResult: 'Новый результат',
      sphereId: 'sphere-development',
      price: 'Три часа',
      sacrifices: 'Сосредоточиться',
      projectReference: 'LifeOS',
      kind: DECISION_KIND.additional,
      priority: DECISION_PRIORITY.low,
      expectedVersion: 7,
    } as const;

    const result = await updateDecisionDetailsResult({
      decisionId: decision.id,
      form,
      updateDecisionDetails: { execute },
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({
      decisionId: decision.id,
      expectedVersion: 7,
      title: 'Обновлённое решение',
      reason: 'Новая причина',
      expectedResult: 'Новый результат',
      sphereId: EntityId.create('sphere-development'),
      price: 'Три часа',
      sacrifices: 'Сосредоточиться',
      projectReference: 'LifeOS',
      kind: DECISION_KIND.additional,
      priority: DECISION_PRIORITY.low,
    });
  });

  it('показывает конфликт версии без закрытия формы и сохраняет введённые значения', () => {
    const decision = createPlannedDecision('edit-conflict', DATE);
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const changed = todayPageReducer(opened, {
      type: 'decision_edit_text_changed',
      field: 'reason',
      value: 'Несохранённое уточнение',
    });
    const failed = todayPageReducer(changed, {
      type: 'decision_edit_failed',
      message: decisionEditErrorMessage('decision.edit_conflict'),
    });
    const markup = renderView(failed);

    expect(failed.isDecisionEditFormOpen).toBe(true);
    expect(failed.decisionEditForm.reason).toBe('Несохранённое уточнение');
    expect(markup).toContain('Решение изменилось в другой вкладке');
    expect(markup).toContain('Несохранённое уточнение');
  });

  it('показывает ошибки обязательных полей рядом с соответствующими полями', () => {
    const decision = createPlannedDecision('edit-field-error', DATE);
    const state = {
      ...createDetailsState(decision),
      isDecisionEditFormOpen: true,
      decisionEditForm: {
        title: '',
        expectedResult: decision.expectedResult!.toString(),
        kind: DECISION_KIND.main,
        expectedVersion: decision.version,
      },
      decisionEditError: 'Введите название решения',
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('<small class="field-error">Введите название решения</small>');
    expect(markup).not.toContain('<p class="form-error" role="alert">Введите название решения</p>');
  });

  it('не предлагает обычное редактирование подтверждённого решения', () => {
    const decision = confirmDecision(createPlannedDecision('edit-confirmed', DATE));
    const markup = renderView(createDetailsState(decision));

    expect(markup).not.toContain('>Редактировать<');
    expect(markup).not.toContain('>Уточнить решение<');
    expect(markup).not.toContain('Сохранить изменения');
  });

  it('сохраняет введённые данные при ошибке редактирования и блокирует повторную отправку', () => {
    const decision = createPlannedDecision('edit-failure', DATE);
    const state = {
      ...createDetailsState(decision),
      isDecisionEditFormOpen: true,
      isDecisionEditing: true,
      decisionEditForm: { title: 'Текст остаётся', expectedResult: 'Результат остаётся' },
      decisionEditError: decisionEditErrorMessage('decision.cannot_edit'),
    } satisfies TodayPageState;
    const markup = renderView(state);

    expect(markup).toContain('Текст остаётся');
    expect(markup).toContain('Результат остаётся');
    expect(markup).toContain('Это решение уже нельзя редактировать');
    expect(markup).not.toContain('decision.cannot_edit');
    expect(markup).toContain('Сохраняем…');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('обновляет решение после редактирования без F5 и вызывает прикладную команду', async () => {
    const decision = createPlannedDecision('edit-workflow', DATE);
    decision.updateDetails({
      title: decision.title,
      expectedResult: decision.expectedResult,
      occurredAt: new Date('2026-08-02T11:00:00.000+09:00'),
      eventId: EntityId.create('unused-edit-event'),
    });
    const execute = vi.fn().mockResolvedValue(success(decision));

    const result = await updateDecisionDetailsResult({
      decisionId: decision.id,
      form: { title: 'Новое название', expectedResult: 'Новый результат' },
      updateDecisionDetails: { execute },
    });
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_edit_form_opened',
    });
    const succeeded = todayPageReducer(opened, {
      type: 'decision_edit_succeeded',
      decision,
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({
      decisionId: decision.id,
      title: 'Новое название',
      expectedResult: 'Новый результат',
    });
    expect(succeeded.isDecisionEditFormOpen).toBe(false);
    expect(succeeded.decisionEditForm).toEqual({ title: '', expectedResult: '' });
  });

  it('подтверждает отмену отдельно и объясняет блокировку незавершёнными действиями', async () => {
    const decision = createPlannedDecision('cancel-workflow', DATE);
    const opened = todayPageReducer(createDetailsState(decision), {
      type: 'decision_cancellation_opened',
    });
    const failed = todayPageReducer(opened, {
      type: 'decision_cancellation_failed',
      message: decisionCancellationErrorMessage('decision.actions_unfinished'),
    });
    const openedMarkup = renderView(opened);
    const failedMarkup = renderView(failed);
    const execute = vi.fn().mockResolvedValue(success(cancelDecision(decision)));
    const result = await cancelDecisionResult({
      decisionId: decision.id,
      cancelDecisionSafely: { execute },
    });
    const succeeded = todayPageReducer(failed, {
      type: 'decision_cancellation_succeeded',
      decision,
    });

    expect(openedMarkup).toContain('Отменить это решение?');
    expect(failedMarkup).toContain('Сначала завершите или отмените незавершённые действия');
    expect(failedMarkup).not.toContain('decision.actions_unfinished');
    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledWith({ decisionId: decision.id });
    expect(renderView(succeeded)).toContain('Решение отменено');
    expect(renderView(succeeded)).not.toContain('Редактировать');
  });

  it('в прошлом активном дне разрешает завершить только существующую незавершённую сессию', () => {
    const pastDate = DayDate.create('2026-08-01');
    const decision = createPlannedDecision('session-recovery-decision', pastDate);
    const action = markLifeActionInProgress(
      createReadyLifeAction('session-recovery-action', pastDate, { decisionId: decision.id }),
    );
    const session = createSession(
      'session-recovery-running',
      action.id,
      new Date('2026-08-01T08:00:00.000+09:00'),
    );
    const staleDay = createOpenDayForRecovery('session-recovery-open-day', pastDate);
    const markup = renderView(
      createActionDetailsState(decision, action, [session], session),
      pastDate,
      createCurrentPlannedDay(),
      {
        openDayConflictState: {
          status: 'ready',
          snapshot: {
            hasConflict: false,
            openDays: [{ day: staleDay, hasUnfinishedSession: true }],
            unfinishedSession: session,
            unfinishedLifeAction: action,
            unfinishedSessionDayId: staleDay.id,
            hasOrphanedUnfinishedSession: false,
          },
        },
      },
    );

    expect(markup).toContain('Разрешено лишь завершить незавершённую рабочую сессию');
    expect(markup).toContain('Текущая сессия');
    expect(markup).toContain('>Завершить</button>');
    expect(markup).not.toContain('>Редактировать</button>');
    expect(markup).not.toContain('>Перенести</button>');
  });

  it('прошедший день открывает действие только для просмотра', () => {
    const decision = createPlannedDecision('read-only-action', DATE);
    const action = createReadyLifeAction('read-only-action', DATE, { decisionId: decision.id });
    const markup = renderView(
      createActionDetailsState(decision, action),
      DayDate.create('2026-08-01'),
    );

    expect(markup).toContain('Прошедший день доступен только для просмотра');
    expect(markup).not.toContain('Начать выполнение');
    expect(markup).not.toContain('>Редактировать<');
    expect(markup).not.toContain('>Перенести<');
    expect(markup).not.toContain('Отменить действие');
  });

  it('показывает редактирование только для ready-действия и заполняет форму текущими значениями', () => {
    const decision = createPlannedDecision('action-edit-visible', DATE);
    const ready = createReadyLifeAction('action-edit-ready', DATE, {
      decisionId: decision.id,
      description: 'Текущее описание',
    });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('action-edit-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('action-edit-completed', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('action-edit-cancelled', DATE, { decisionId: decision.id }),
    );

    const readyMarkup = renderView(createActionDetailsState(decision, ready));
    const opened = todayPageReducer(createActionDetailsState(decision, ready), {
      type: 'life_action_edit_form_opened',
    });
    const openedMarkup = renderView(opened);
    const closed = todayPageReducer(opened, { type: 'life_action_edit_form_closed' });

    expect(readyMarkup).toContain('Редактировать');
    expect(openedMarkup).toContain('Редактирование действия');
    expect(openedMarkup).toContain('Действие action-edit-ready');
    expect(openedMarkup).toContain('Текущее описание');
    expect(openedMarkup).toContain('Результат action-edit-ready');
    expect(renderView(closed)).not.toContain('Редактирование действия');
    for (const action of [inProgress, completed, cancelled]) {
      expect(renderView(createActionDetailsState(decision, action))).not.toContain(
        '>Редактировать<',
      );
    }
  });

  it('проверяет поля редактирования и обновляет панель и список действия без F5', async () => {
    const decision = createPlannedDecision('action-edit-success', DATE);
    const current = createReadyLifeAction('action-edit-success', DATE, { decisionId: decision.id });
    const updated = createReadyLifeAction('action-edit-success', DATE, {
      decisionId: decision.id,
      description: 'Новое описание',
    });
    updated.updateDetails({
      title: current.title,
      description: 'Новое описание',
      expectedResult: current.expectedResult!,
      occurredAt: new Date('2026-08-02T12:00:00.000+09:00'),
      eventId: EntityId.create('ui-details-event'),
    });
    const execute = vi.fn().mockResolvedValue(success(updated));
    const form = {
      title: updated.title.toString(),
      description: 'Новое описание',
      expectedResult: updated.expectedResult!.toString(),
      sphereId: '',
    };

    expect(validateLifeActionEditForm({ ...form, title: ' ' })).toBe('Введите название действия');
    expect(validateLifeActionEditForm({ ...form, expectedResult: ' ' })).toBe(
      'Укажите ожидаемый результат',
    );
    const result = await updateLifeActionDetailsResult({
      lifeActionId: current.id,
      form,
      updateLifeActionDetails: { execute },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected updated LifeAction');
    }
    const succeeded = todayPageReducer(
      {
        ...createActionDetailsState(decision, current),
        isLifeActionEditFormOpen: true,
        lifeActionEditForm: form,
      },
      { type: 'life_action_edit_succeeded', lifeAction: result.lifeAction },
    );

    expect(succeeded.isLifeActionEditFormOpen).toBe(false);
    expect(succeeded.actionDetails.status === 'ready' && succeeded.actionDetails.lifeAction).toBe(
      updated,
    );
    expect(succeeded.details.status === 'ready' && succeeded.details.lifeActions[0]).toBe(updated);
    expect(renderView(succeeded)).toContain('Новое описание');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('блокирует повторное сохранение и сохраняет введённые значения после понятной ошибки', () => {
    const decision = createPlannedDecision('action-edit-failed', DATE);
    const action = createReadyLifeAction('action-edit-failed', DATE, { decisionId: decision.id });
    const form = {
      title: 'Введённое название',
      description: 'Введённое описание',
      expectedResult: 'Введённый результат',
      sphereId: '',
    };
    const pending = {
      ...createActionDetailsState(decision, action),
      isLifeActionEditFormOpen: true,
      isLifeActionEditing: true,
      lifeActionEditForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'life_action_edit_failed',
      message: lifeActionEditErrorMessage('action.cannot_edit'),
    });

    expect(renderView(pending).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(failed.lifeActionEditForm).toBe(form);
    expect(renderView(failed)).toContain('Введённое описание');
    expect(renderView(failed)).toContain('Это действие уже нельзя редактировать');
    expect(renderView(failed)).not.toContain('action.cannot_edit');
  });

  it('показывает перенос только для ready-действия и открывает предзаполненную форму', () => {
    const decision = createPlannedDecision('action-reschedule-visible', DATE);
    const ready = createReadyLifeAction('action-reschedule-ready', DATE, {
      decisionId: decision.id,
    });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('action-reschedule-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('action-reschedule-completed', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('action-reschedule-cancelled', DATE, { decisionId: decision.id }),
    );
    const initial = createActionDetailsState(decision, ready);
    const opened = todayPageReducer(initial, { type: 'life_action_reschedule_form_opened' });
    const openedMarkup = renderView(opened);
    const closed = todayPageReducer(opened, { type: 'life_action_reschedule_form_closed' });

    expect(renderView(initial)).toContain('>Перенести<');
    expect(openedMarkup).toContain('Перенос действия');
    expect(openedMarkup).toContain('Текущая дата действия:');
    expect(openedMarkup).toContain('value="2026-08-02"');
    expect(openedMarkup).toContain('>Завтра<');
    expect(openedMarkup).toContain('>Через неделю<');
    expect(renderView(closed)).not.toContain('Перенос действия');
    expect(closed.actionDetails.status === 'ready' && closed.actionDetails.lifeAction).toBe(ready);
    for (const action of [inProgress, completed, cancelled]) {
      expect(renderView(createActionDetailsState(decision, action))).not.toContain('>Перенести<');
    }
  });

  it('быстрые варианты заполняют дату, а отличие от даты решения показывает предупреждение', () => {
    const decision = createPlannedDecision('action-reschedule-quick', DATE);
    const action = createReadyLifeAction('action-reschedule-quick', DATE, {
      decisionId: decision.id,
    });
    const opened = todayPageReducer(createActionDetailsState(decision, action), {
      type: 'life_action_reschedule_form_opened',
    });
    const tomorrow = todayPageReducer(opened, {
      type: 'life_action_reschedule_date_changed',
      newPlannedDate: '2026-08-03',
    });
    const nextWeek = todayPageReducer(opened, {
      type: 'life_action_reschedule_date_changed',
      newPlannedDate: '2026-08-09',
    });

    expect(tomorrow.lifeActionRescheduleForm.newPlannedDate).toBe('2026-08-03');
    expect(nextWeek.lifeActionRescheduleForm.newPlannedDate).toBe('2026-08-09');
    expect(renderView(tomorrow)).toContain('Дата действия будет отличаться от даты решения');
    expect(renderView(opened)).not.toContain('Дата действия будет отличаться от даты решения');
  });

  it('показывает понятные ошибки переноса, сохраняет дату и блокирует повторную отправку', async () => {
    const decision = createPlannedDecision('action-reschedule-error', DATE);
    const action = createReadyLifeAction('action-reschedule-error', DATE, {
      decisionId: decision.id,
    });
    const form = { newPlannedDate: '2026-08-01', reason: 'Нужен дополнительный день' };
    const execute = vi
      .fn()
      .mockResolvedValue(
        failure(new DomainError('action.planned_date_in_past', 'internal reschedule error')),
      );

    expect(validateLifeActionRescheduleForm({ newPlannedDate: ' ' })).toBe('Выберите новую дату');
    const result = await rescheduleLifeActionResult({
      lifeActionId: action.id,
      form,
      rescheduleLifeActionSafely: { execute },
    });
    expect(result).toEqual({
      ok: false,
      message: 'Нельзя перенести действие на прошедшую дату',
    });
    const pending = {
      ...createActionDetailsState(decision, action),
      isLifeActionRescheduleFormOpen: true,
      isLifeActionRescheduling: true,
      lifeActionRescheduleForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'life_action_reschedule_failed',
      message: result.ok ? '' : result.message,
    });
    const pendingMarkup = renderView(pending);
    const failedMarkup = renderView(failed);

    expect(pendingMarkup).toContain('Переносим…');
    expect(pendingMarkup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
    expect(failed.lifeActionRescheduleForm).toBe(form);
    expect(failedMarkup).toContain('value="2026-08-01"');
    expect(failedMarkup).toContain('Нельзя перенести действие на прошедшую дату');
    expect(failedMarkup).not.toContain('action.planned_date_in_past');
    expect(lifeActionRescheduleErrorMessage('action.session_unfinished')).toBe(
      'Сначала завершите текущую сессию',
    );
    expect(lifeActionRescheduleErrorMessage('action.cannot_reschedule')).toBe(
      'Это действие уже нельзя переносить',
    );
  });

  it('успешный перенос сразу обновляет панель и список решения без дубликата', async () => {
    const decision = createPlannedDecision('action-reschedule-success', DATE);
    const current = createReadyLifeAction('action-reschedule-success', DATE, {
      decisionId: decision.id,
    });
    const newDate = DayDate.create('2026-08-03');
    const updated = createReadyLifeAction('action-reschedule-success', DATE, {
      decisionId: decision.id,
    });
    updated.clearUncommittedEvents();
    updated.reschedule(
      newDate,
      new Date('2026-08-02T12:00:00.000+09:00'),
      EntityId.create('ui-rescheduled-event'),
    );
    const execute = vi.fn().mockResolvedValue(success(updated));
    const result = await rescheduleLifeActionResult({
      lifeActionId: current.id,
      form: { newPlannedDate: newDate.toString() },
      rescheduleLifeActionSafely: { execute },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected rescheduled LifeAction');
    }
    const succeeded = todayPageReducer(
      {
        ...createActionDetailsState(decision, current),
        isLifeActionRescheduleFormOpen: true,
        lifeActionRescheduleForm: { newPlannedDate: newDate.toString() },
      },
      { type: 'life_action_reschedule_succeeded', lifeAction: result.lifeAction },
    );
    const markup = renderView(succeeded);

    expect(succeeded.isLifeActionRescheduleFormOpen).toBe(false);
    expect(succeeded.actionDetails.status === 'ready' && succeeded.actionDetails.lifeAction).toBe(
      updated,
    );
    expect(succeeded.details.status === 'ready' && succeeded.details.lifeActions).toEqual([
      updated,
    ]);
    expect(markup).toContain('3 августа 2026 г.');
    expect(markup).not.toContain('Перенос действия');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('показывает спокойное подтверждение отмены только для ready и in_progress', () => {
    const decision = createPlannedDecision('action-cancel-visible', DATE);
    const ready = createReadyLifeAction('action-cancel-ready', DATE, { decisionId: decision.id });
    const progress = markLifeActionInProgress(
      createReadyLifeAction('action-cancel-progress', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('action-cancel-completed', DATE, { decisionId: decision.id }),
    );
    const initial = createActionDetailsState(decision, ready);
    const opened = todayPageReducer(initial, { type: 'life_action_cancellation_opened' });
    const backed = todayPageReducer(opened, { type: 'life_action_cancellation_closed' });
    const markup = renderView(opened);

    expect(renderView(initial)).toContain('Отменить действие');
    expect(renderView(createActionDetailsState(decision, progress))).toContain('Отменить действие');
    expect(renderView(createActionDetailsState(decision, completed))).not.toContain(
      'Отменить действие',
    );
    expect(markup).toContain('Отменить это действие?');
    expect(markup).toContain(
      'Действие останется в истории, но продолжить его выполнение будет нельзя',
    );
    expect(markup).toContain('Назад');
    expect(backed.actionDetails.status === 'ready' && backed.actionDetails.lifeAction).toBe(ready);
  });

  it('показывает блокировку активной сессией без внутренних кодов', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('active-cancel', DATE));
    const execute = vi
      .fn()
      .mockResolvedValue(
        failure(new DomainError('action.session_unfinished', 'internal session error')),
      );
    const result = await cancelLifeActionResult({
      lifeActionId: action.id,
      cancelLifeActionSafely: { execute },
    });

    expect(result).toEqual({ ok: false, message: 'Сначала завершите текущую сессию' });
    expect(lifeActionCancellationErrorMessage('action.session_unfinished')).toBe(
      'Сначала завершите текущую сессию',
    );
  });

  it('после отмены обновляет карточки, скрывает управление и сохраняет историю сессий', () => {
    const decision = createPlannedDecision('action-cancel-success', DATE);
    const current = markLifeActionInProgress(
      createReadyLifeAction('action-cancel-success', DATE, { decisionId: decision.id }),
    );
    const completedSession = completeSession(createSession('before-cancel', current.id));
    const cancelled = cancelLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('action-cancel-success', DATE, { decisionId: decision.id }),
      ),
    );
    const state = todayPageReducer(
      {
        ...createActionDetailsState(decision, current, [completedSession], null),
        isLifeActionCancellationOpen: true,
      },
      { type: 'life_action_cancellation_succeeded', lifeAction: cancelled },
    );
    const markup = renderView(state);

    expect(markup).toContain('Отменено');
    expect(markup).toContain('Действие отменено');
    expect(markup).toContain('Завершённые сессии');
    expect(markup).toContain('Результат рабочей сессии');
    expect(markup).not.toContain('Начать выполнение');
    expect(markup).not.toContain('Продолжить новой сессией');
    expect(markup).not.toContain('>Редактировать<');
    expect(markup).not.toContain('Отменить это действие?');
    expect(state.details.status === 'ready' && state.details.lifeActions[0]).toBe(cancelled);
  });

  it('shows action details, decision relation, and back navigation without internal fields', () => {
    const decision = createPlannedDecision('action-details', DATE);
    const action = createReadyLifeAction('details-action', DATE, {
      decisionId: decision.id,
      description: 'Короткое описание действия',
    });
    const markup = renderView(createActionDetailsState(decision, action));

    expect(markup).toContain('Назад к решению');
    expect(markup).toContain('Действие details-action');
    expect(markup).toContain('Короткое описание действия');
    expect(markup).toContain('Результат details-action');
    expect(markup).toContain('Готово к выполнению');
    expect(markup).toContain('Решение «Решение action-details»');
    expect(markup).not.toContain('details-action-ready-event');
    expect(markup).not.toContain('<dt>Version</dt>');
    expect(markup).not.toContain('session.unfinished_exists');
  });

  it('shows action-session loading, controlled error, retry, and back navigation', () => {
    const decision = createPlannedDecision('action-loading', DATE);
    const action = createReadyLifeAction('loading-action', DATE, { decisionId: decision.id });
    const loading = todayPageReducer(createDetailsState(decision, [action]), {
      type: 'action_details_load_started',
      lifeAction: action,
    });
    const failed = todayPageReducer(loading, {
      type: 'action_details_load_failed',
      lifeActionId: action.id,
    });
    const back = todayPageReducer(failed, { type: 'action_details_closed' });

    expect(renderView(loading)).toContain('Загружаем выполнение…');
    expect(renderView(failed)).toContain('Не удалось загрузить выполнение');
    expect(renderView(failed)).toContain('Повторить');
    expect(renderView(failed)).toContain('Назад к решению');
    expect(renderView(back)).toContain('Действия по решению');
  });

  it('shows an empty session history and a compact completed-session history', () => {
    const decision = createPlannedDecision('history', DATE);
    const action = createReadyLifeAction('history-action', DATE, { decisionId: decision.id });
    const emptyMarkup = renderView(createActionDetailsState(decision, action));
    const completed = completeSession(createSession('completed-history', action.id));
    const filledMarkup = renderView(createActionDetailsState(decision, action, [completed], null));

    expect(emptyMarkup).toContain('Завершённых сессий пока нет');
    expect(filledMarkup).toContain('Завершённые сессии');
    expect(filledMarkup).toContain('Завершена');
    expect(filledMarkup).toContain('05:00');
    expect(filledMarkup).toContain('Результат рабочей сессии');
  });

  it('shows start controls only for eligible actions without an active session', () => {
    const decision = createPlannedDecision('start-control', DATE);
    const ready = createReadyLifeAction('ready-start', DATE, { decisionId: decision.id });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('progress-start', DATE, { decisionId: decision.id }),
    );
    const completed = completeLifeAction(
      createReadyLifeAction('completed-action', DATE, { decisionId: decision.id }),
    );
    const cancelled = cancelLifeAction(
      createReadyLifeAction('cancelled-action', DATE, { decisionId: decision.id }),
    );

    expect(renderView(createActionDetailsState(decision, ready))).toContain('Начать выполнение');
    expect(renderView(createActionDetailsState(decision, inProgress))).toContain(
      'Продолжить новой сессией',
    );
    expect(renderView(createActionDetailsState(decision, completed))).not.toContain(
      'Начать выполнение',
    );
    expect(renderView(createActionDetailsState(decision, cancelled))).not.toContain(
      'Начать выполнение',
    );
  });

  it('updates the action and shows a running session after start without reloading', () => {
    const decision = createPlannedDecision('started-state', DATE);
    const action = createReadyLifeAction('started-action', DATE, { decisionId: decision.id });
    const initial = createActionDetailsState(decision, action);
    const updatedAction = markLifeActionInProgress(action);
    const running = createSession('running-after-start', action.id);
    const started = todayPageReducer(initial, {
      type: 'session_started',
      lifeAction: updatedAction,
      session: running,
    });
    const markup = renderView(started);

    expect(markup).toContain('Выполняется');
    expect(markup).toContain('Пауза');
    expect(markup).toContain('02:00:00');
    expect(markup).not.toContain('Начать выполнение');
    expect(started.details.status === 'ready' && started.details.lifeActions[0]?.status).toBe(
      'in_progress',
    );
  });

  it('снимает признак сохранения после запуска с главной карточки без открытой панели', () => {
    const action = markLifeActionInProgress(createReadyLifeAction('direct-card-start', DATE));
    const session = createSession('direct-card-session', action.id);
    const pending = todayPageReducer(INITIAL_TODAY_PAGE_STATE, {
      type: 'session_operation_started',
    });
    const settled = todayPageReducer(pending, {
      type: 'session_started',
      lifeAction: action,
      session,
    });

    expect(settled.actionDetails.status).toBe('closed');
    expect(settled.isSessionMutating).toBe(false);
    expect(settled.sessionError).toBeNull();
  });

  it('blocks start for running and paused sessions that belong to another action', () => {
    const decision = createPlannedDecision('foreign-session', DATE);
    const action = createReadyLifeAction('blocked-action', DATE, { decisionId: decision.id });
    const foreignRunning = createSession('foreign-running', EntityId.create('foreign-action'));
    const foreignPaused = pauseSession(
      createSession('foreign-paused', EntityId.create('other-foreign-action')),
    );

    for (const unfinished of [foreignRunning, foreignPaused]) {
      const markup = renderView(createActionDetailsState(decision, action, [], unfinished));
      expect(markup).toContain('Сначала завершите или приостановите текущую работу');
      expect(markup).toContain('disabled=""');
    }
  });

  it('does not block start when another action has only a completed session', () => {
    const decision = createPlannedDecision('completed-foreign', DATE);
    const action = createReadyLifeAction('unblocked-action', DATE, { decisionId: decision.id });
    const completedForeign = completeSession(
      createSession('foreign-completed', EntityId.create('foreign-completed-action')),
    );
    const markup = renderView(createActionDetailsState(decision, action, [completedForeign], null));

    expect(markup).toContain('Начать выполнение');
    expect(markup).not.toContain('Сначала завершите или приостановите текущую работу');
  });

  it('switches the active session between running and paused controls', () => {
    const decision = createPlannedDecision('pause-resume', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('pause-resume-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('pause-resume-session', action.id);
    const initial = createActionDetailsState(decision, action, [running], running);
    const paused = pauseSession(running);
    const pausedState = todayPageReducer(initial, { type: 'session_updated', session: paused });
    const pausedMarkup = renderView(pausedState);
    const resumed = resumeSession(paused);
    const resumedState = todayPageReducer(pausedState, {
      type: 'session_updated',
      session: resumed,
    });

    expect(pausedMarkup).toContain('На паузе');
    expect(pausedMarkup).toContain('Продолжить');
    expect(pausedMarkup).toContain('Завершить');
    expect(renderView(resumedState)).toContain('Выполняется');
    expect(renderView(resumedState)).toContain('Пауза');
    expect(renderView(resumedState)).toContain('Завершить');
  });

  it('opens and cancels the completion form with the required defaults', () => {
    const decision = createPlannedDecision('completion-form', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-form-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-form-session', action.id);
    const initial = createActionDetailsState(decision, action, [running], running);
    const opened = todayPageReducer(initial, { type: 'session_completion_form_opened' });
    const markup = renderView(opened);

    expect(markup).toContain('Завершение работы');
    expect(markup).toContain('Что сделано за эту сессию');
    expect(markup).toContain('Сессия завершена');
    expect(markup).toContain('Работа прервана');
    expect(markup).toContain('Продолжить действие позже');
    expect(markup).toContain('Подтвердить результат и завершить действие');
    expect(markup).not.toContain('Фактический результат действия *');
    expect(opened.sessionCompletionForm.completionKind).toBe(SESSION_COMPLETION_KIND.completed);
    expect(opened.sessionCompletionForm.actionChoice).toBe(ACTION_COMPLETION_CHOICE.continueLater);
    expect(validateSessionCompletionForm(opened.sessionCompletionForm)).toBeNull();

    const cancelled = todayPageReducer(opened, { type: 'session_completion_form_closed' });
    expect(cancelled.isSessionCompletionFormOpen).toBe(false);
    expect(renderView(cancelled)).not.toContain('Завершение работы');
  });

  it('для подтверждения результата требует завершённую сессию, результат сессии и фактический результат действия', () => {
    const decision = createPlannedDecision('completion-fields', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-fields-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-fields-session', action.id);
    let state = todayPageReducer(createActionDetailsState(decision, action, [running], running), {
      type: 'session_completion_form_opened',
    });
    state = todayPageReducer(state, {
      type: 'session_completion_kind_changed',
      completionKind: SESSION_COMPLETION_KIND.interrupted,
    });
    state = todayPageReducer(state, {
      type: 'action_completion_choice_changed',
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
    });

    const verificationMarkup = renderView(state);
    expect(verificationMarkup).toContain('Критерий проверки');
    expect(verificationMarkup).toContain('Фактический результат действия *');
    expect(verificationMarkup).toContain('Подтвердить результат');
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBe(
      'Чтобы подтвердить результат действия, завершите сессию как выполненную',
    );

    state = todayPageReducer(state, {
      type: 'session_completion_kind_changed',
      completionKind: SESSION_COMPLETION_KIND.completed,
    });
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBe(
      'Запишите, что сделано за эту сессию',
    );

    state = todayPageReducer(state, {
      type: 'session_result_note_changed',
      resultNote: 'Проверен конкретный результат сессии',
    });
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBe(
      'Укажите фактический результат действия',
    );

    state = todayPageReducer(state, {
      type: 'action_actual_result_changed',
      actualResult: 'Получен проверенный результат',
    });
    expect(validateSessionCompletionForm(state.sessionCompletionForm)).toBeNull();
  });

  it('completes only the session and leaves the action in progress', async () => {
    const action = markLifeActionInProgress(createReadyLifeAction('session-only', DATE));
    const running = createSession('session-only-running', action.id);
    const completed = completeSession(createSession('session-only-running', action.id));
    const completeSessionExecute = vi.fn().mockResolvedValue(success(completed));
    const completeActionExecute = vi.fn();

    const result = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form: {
        resultNote: '',
        completionKind: SESSION_COMPLETION_KIND.completed,
        actionChoice: ACTION_COMPLETION_CHOICE.continueLater,
        actualResult: '',
      },
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(result.status).toBe('session_completed');
    expect(completeSessionExecute).toHaveBeenCalledWith({
      sessionId: running.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
    });
    expect(completeActionExecute).not.toHaveBeenCalled();
    expect(action.status).toBe('in_progress');
  });

  it('completes the session and action in order and renders the final summary', async () => {
    const decision = createPlannedDecision('full-completion', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('full-completion-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('full-completion-session', action.id);
    const completedSession = completeSession(createSession('full-completion-session', action.id));
    const completedAction = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('full-completion-action', DATE, { decisionId: decision.id }),
      ),
    );
    const callOrder: string[] = [];
    const completeSessionExecute = vi.fn().mockImplementation(async () => {
      callOrder.push('session');
      return success(completedSession);
    });
    const completeActionExecute = vi.fn().mockImplementation(async () => {
      callOrder.push('action');
      return success(completedAction);
    });

    const result = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form: {
        resultNote: 'Итог сессии',
        completionKind: SESSION_COMPLETION_KIND.completed,
        actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
        actualResult: 'Фактический итог',
      },
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(callOrder).toEqual(['session', 'action']);
    expect(completeActionExecute.mock.calls[0]?.[0].actualResult.toString()).toBe(
      'Фактический итог',
    );
    expect(result.status).toBe('action_completed');
    if (result.status !== 'action_completed') {
      throw new Error('Expected complete action result');
    }
    const state = todayPageReducer(createActionDetailsState(decision, action, [running], running), {
      type: 'life_action_completed',
      lifeAction: result.lifeAction,
      session: result.session,
    });
    const markup = renderView(state);

    expect(markup).toContain('Результат действия подтверждён');
    expect(markup).toContain('Действие выполнено');
    expect(markup).toContain('Завершённых сессий');
    expect(markup).not.toContain('Начать выполнение');
    expect(markup).not.toContain('Продолжить новой сессией');
    expect(markup).not.toContain('Пауза');
  });

  it('keeps the completed session and retries only action completion after a partial failure', async () => {
    const decision = createPlannedDecision('partial-failure', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('partial-failure-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('partial-failure-session', action.id);
    const completedSession = completeSession(createSession('partial-failure-session', action.id));
    const completedAction = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('partial-failure-action', DATE, { decisionId: decision.id }),
      ),
    );
    const completeSessionExecute = vi.fn().mockResolvedValue(success(completedSession));
    const completeActionExecute = vi
      .fn()
      .mockResolvedValueOnce(
        failure(new DomainError('action.persistence_failed', 'internal failure')),
      )
      .mockResolvedValueOnce(success(completedAction));
    const form = {
      resultNote: 'Сессия сохранена',
      completionKind: SESSION_COMPLETION_KIND.completed,
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
      actualResult: 'Результат не должен потеряться',
    } as const;

    const workflow = await completeSessionWorkflow({
      session: running,
      lifeAction: action,
      form,
      completeActionSession: { execute: completeSessionExecute },
      completeLifeAction: { execute: completeActionExecute },
    });
    expect(workflow.status).toBe('action_failed');
    if (workflow.status !== 'action_failed') {
      throw new Error('Expected partial failure');
    }
    const failedState = todayPageReducer(
      {
        ...createActionDetailsState(decision, action, [running], running),
        sessionCompletionForm: form,
        isSessionCompletionFormOpen: true,
      },
      {
        type: 'session_completed_action_failed',
        session: workflow.session,
        message: workflow.message,
      },
    );
    const failedMarkup = renderView(failedState);

    expect(
      failedState.actionDetails.status === 'ready' && failedState.actionDetails.unfinishedSession,
    ).toBeNull();
    expect(failedState.sessionCompletionForm.actualResult).toBe('Результат не должен потеряться');
    expect(failedMarkup).toContain(ACTION_COMPLETION_FAILED_MESSAGE);
    expect(failedMarkup).toContain('Повторить подтверждение результата');
    expect(failedMarkup).not.toContain('Продолжить новой сессией');

    const retry = await retryLifeActionCompletion({
      lifeAction: action,
      actualResult: failedState.sessionCompletionForm.actualResult,
      completeLifeAction: { execute: completeActionExecute },
    });

    expect(retry.ok).toBe(true);
    expect(completeSessionExecute).toHaveBeenCalledOnce();
    expect(completeActionExecute).toHaveBeenCalledTimes(2);
  });

  it('blocks repeated completion submission and preserves entered data after an error', () => {
    const decision = createPlannedDecision('completion-pending', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('completion-pending-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('completion-pending-session', action.id);
    const form = {
      resultNote: 'Введённый итог',
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      actionChoice: ACTION_COMPLETION_CHOICE.completeAction,
      actualResult: 'Введённый фактический результат',
    } as const;
    const pending = {
      ...createActionDetailsState(decision, action, [running], running),
      isSessionMutating: true,
      isSessionCompletionFormOpen: true,
      sessionCompletionForm: form,
    } satisfies TodayPageState;
    const failed = todayPageReducer(pending, {
      type: 'session_operation_failed',
      message: 'Не удалось завершить сессию',
    });

    expect(renderView(pending).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(8);
    expect(failed.sessionCompletionForm).toBe(form);
    expect(renderView(failed)).toContain('Введённый фактический результат');
    expect(renderView(failed)).not.toContain('session.not_found');
  });

  it('shows interrupted session duration, pause time, and newest-first history', () => {
    const decision = createPlannedDecision('history-details', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('history-details-action', DATE, { decisionId: decision.id }),
    );
    const older = completeSession(createSession('older-session', action.id));
    const newer = completeSession(
      pauseSession(
        createSession('newer-session', action.id, new Date('2026-08-02T09:00:00.000+09:00')),
      ),
      SESSION_COMPLETION_KIND.interrupted,
    );
    const markup = renderView(createActionDetailsState(decision, action, [older, newer], null));

    expect(markup).toContain('Прервана');
    expect(markup).toContain('01:00');
    expect(markup).toContain('04:00');
    expect(markup.indexOf('newer-session')).toBe(-1);
    expect(markup.indexOf('09:00')).toBeLessThan(markup.indexOf('08:00'));
  });

  it('disables session controls while a command is pending', () => {
    const decision = createPlannedDecision('pending-session', DATE);
    const action = markLifeActionInProgress(
      createReadyLifeAction('pending-action', DATE, { decisionId: decision.id }),
    );
    const running = createSession('pending-running', action.id);
    const pending = todayPageReducer(
      createActionDetailsState(decision, action, [running], running),
      { type: 'session_operation_started' },
    );

    expect(renderView(pending)).toContain('disabled=""');
    expect(pending.isSessionMutating).toBe(true);
  });

  it('maps session errors to understandable text without exposing internal codes', () => {
    const decision = createPlannedDecision('session-errors', DATE);
    const action = createReadyLifeAction('error-action', DATE, { decisionId: decision.id });
    const failed = todayPageReducer(createActionDetailsState(decision, action), {
      type: 'session_operation_failed',
      message: startSessionErrorMessage('session.unfinished_exists'),
    });
    const markup = renderView(failed);

    expect(markup).toContain('Сначала завершите или приостановите текущую работу');
    expect(markup).not.toContain('session.unfinished_exists');
    expect(startSessionErrorMessage('day.not_started')).toBe('Сначала начните текущий день');
    expect(startSessionErrorMessage('action.not_scheduled_for_current_day')).toBe(
      'Это действие запланировано на другую дату',
    );
    expect(pauseSessionErrorMessage('session.not_found')).toBe('Сессия больше недоступна');
    expect(pauseSessionErrorMessage('unknown')).toBe('Не удалось поставить работу на паузу');
    expect(resumeSessionErrorMessage()).toBe('Не удалось продолжить работу');
    expect(completeSessionErrorMessage('session.not_found')).toBe('Сессия больше недоступна');
    expect(completeSessionErrorMessage('unknown')).toBe('Не удалось завершить сессию');
  });

  it('shows the complete decision overview with creation fields, time, results, and lifecycle', () => {
    const decision = createDetailedDecision();
    const action = completeLifeAction(
      createReadyLifeAction('overview-action', DATE, { decisionId: decision.id }),
    );
    const session = completeSession(createSession('overview-session', action.id));
    const state: TodayPageState = {
      ...createReadyState([decision]),
      details: {
        status: 'ready',
        decisionId: decision.id,
        decision,
        lifeActions: [action],
        actionOverviews: [{ lifeAction: action, sessions: [session] }],
      },
    };

    const markup = renderView(state);

    expect(markup).toContain('Причина стратегического выбора');
    expect(markup).toContain('Сфера развития');
    expect(markup).toContain('Высокий');
    expect(markup).toContain('Цена концентрации');
    expect(markup).toContain('Отказ от отвлечений');
    expect(markup).toContain('Проект LifeOS');
    expect(markup).toContain('Затрачено времени');
    expect(markup).toContain('5 мин');
    expect(markup).toContain('Фактические результаты действий');
    expect(markup).toContain('Действие выполнено');
    expect(markup).toContain('История состояния');
    expect(markup).toContain('Решение создано');
    expect(markup).toContain('Решение запланировано');
    expect(markup).toContain('Завершено сессий');
  });

  it('formats timers as MM:SS and HH:MM:SS', () => {
    expect(formatDuration(59_999)).toBe('00:59');
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('ticks the running timer once per second with managed fake timers', () => {
    vi.useFakeTimers();
    try {
      const onTick = vi.fn();
      const cancel = scheduleSessionTimer(onTick);

      vi.advanceTimersByTime(3_100);
      expect(onTick).toHaveBeenCalledTimes(3);

      cancel();
      vi.advanceTimersByTime(2_000);
      expect(onTick).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createDetailedDecision(): Decision {
  const decision = Decision.createDraft({
    id: EntityId.create('detailed-decision'),
    title: DecisionTitle.create('Подробное решение'),
    kind: DECISION_KIND.main,
    reason: 'Причина стратегического выбора',
    expectedResult: ExpectedResult.create('Проверяемый итог решения'),
    sphereId: EntityId.create('sphere-growth'),
    price: 'Цена концентрации',
    sacrifices: 'Отказ от отвлечений',
    priority: DECISION_PRIORITY.high,
    projectReference: 'Проект LifeOS',
    occurredAt: new Date('2026-08-02T07:00:00.000+09:00'),
    eventId: EntityId.create('detailed-decision-created'),
  });
  decision.plan({
    plannedDate: DATE,
    kind: DECISION_KIND.main,
    order: 1,
    expectedResult: ExpectedResult.create('Проверяемый итог решения'),
    occurredAt: new Date('2026-08-02T07:30:00.000+09:00'),
    eventId: EntityId.create('detailed-decision-planned'),
  });
  return decision;
}

function createReadyState(
  decisions: readonly ReturnType<typeof createPlannedDecision>[],
): TodayPageState {
  return {
    ...INITIAL_TODAY_PAGE_STATE,
    decisions: { status: 'ready', decisions },
  };
}

function createDetailsState(
  decision: ReturnType<typeof createPlannedDecision>,
  lifeActions: readonly LifeAction[] = [],
): TodayPageState {
  return {
    ...createReadyState([decision]),
    details: {
      status: 'ready',
      decisionId: decision.id,
      decision,
      lifeActions,
    },
  };
}

function createActionDetailsState(
  decision: ReturnType<typeof createPlannedDecision>,
  lifeAction: LifeAction,
  sessions: readonly ActionSession[] = [],
  unfinishedSession: ActionSession | null = null,
): TodayPageState {
  return {
    ...createDetailsState(decision, [lifeAction]),
    actionDetails: {
      status: 'ready',
      lifeAction,
      sessions,
      unfinishedSession,
    },
  };
}

function createSession(
  id: string,
  lifeActionId: EntityId,
  startedAt = new Date('2026-08-02T08:00:00.000+09:00'),
): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt,
    eventId: EntityId.create(`${id}-started-event`),
  });
}

function pauseSession(session: ActionSession): ActionSession {
  session.pause(
    new Date(session.startedAt.getTime() + 60_000),
    EntityId.create(`${session.id.toString()}-pause-event`),
  );
  return session;
}

function resumeSession(session: ActionSession): ActionSession {
  session.resume(
    new Date(session.startedAt.getTime() + 120_000),
    EntityId.create(`${session.id.toString()}-resume-event`),
  );
  return session;
}

function completeSession(
  session: ActionSession,
  completionKind: 'completed' | 'interrupted' = 'completed',
): ActionSession {
  session.complete({
    completedAt: new Date(session.startedAt.getTime() + 300_000),
    completionKind,
    resultNote: SessionResultNote.create('Результат рабочей сессии'),
    eventId: EntityId.create(`${session.id.toString()}-complete-event`),
  });
  return session;
}

function createOpenDayForRecovery(dayId: string, date: DayDate): Day {
  return Day.openCurrent({
    id: EntityId.create(dayId),
    currentDate: date,
    occurredAt: new Date(`${date.toString()}T08:00:00.000+09:00`),
    createdEventId: EntityId.create(`${dayId}-created`),
    openedEventId: EntityId.create(`${dayId}-opened`),
  });
}

function createCurrentPlannedDay(): Day {
  const day = Day.createCurrentPlanned({
    id: EntityId.create('today-page-current-day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-02T00:01:00.000+09:00'),
    createdEventId: EntityId.create('today-page-current-day-created'),
  });
  expect(day.status).toBe(DAY_STATUS.planned);
  return day;
}

function createCurrentOpenDay(): Day {
  const day = Day.openCurrent({
    id: EntityId.create('today-page-open-day'),
    currentDate: DATE,
    occurredAt: new Date('2026-08-02T08:00:00.000+09:00'),
    createdEventId: EntityId.create('today-page-open-created'),
    openedEventId: EntityId.create('today-page-opened'),
  });
  expect(day.status).toBe(DAY_STATUS.open);
  return day;
}

function createCompletedCurrentDay(): Day {
  const day = createCurrentOpenDay();
  day.complete(
    new Date('2026-08-02T21:00:00.000+09:00'),
    EntityId.create('today-page-completed'),
    'Итог контрольного дня',
    EntityId.create('sphere-development'),
  );
  expect(day.status).toBe(DAY_STATUS.completed);
  return day;
}

function renderView(
  state: TodayPageState,
  selectedDate: DayDate = DATE,
  currentDay: Day = createCurrentPlannedDay(),
  options: {
    readonly currentLifeActions?: readonly LifeAction[];
    readonly unfinishedSession?: ActionSession | null;
    readonly currentDaySessions?: readonly ActionSession[];
    readonly recoveryStatus?: 'loading' | 'ready' | 'error';
    readonly isStartingDay?: boolean;
    readonly isEveningControlOpen?: boolean;
    readonly preferredLifeActionId?: string | null;
    readonly openDayConflictState?: Parameters<typeof TodayPageView>[0]['openDayConflictState'];
    readonly projects?: readonly Project[];
    readonly tomorrowPlanSummary?:
      | { readonly status: 'loading' }
      | {
          readonly status: 'ready';
          readonly prepared: boolean;
          readonly mainDecisionCount: number;
        }
      | { readonly status: 'error' };
  } = {},
): string {
  const todayScreenState = resolveTodayScreenState({
    day: currentDay,
    decisionsStatus: state.decisions.status,
    decisions: state.decisions.status === 'ready' ? state.decisions.decisions : [],
    recoveryStatus: options.recoveryStatus ?? 'ready',
    lifeActions: options.currentLifeActions ?? [],
    unfinishedSession: options.unfinishedSession ?? null,
    isEveningControlOpen: options.isEveningControlOpen ?? false,
    preferredLifeActionId: options.preferredLifeActionId ?? null,
  });

  return renderToStaticMarkup(
    TodayPageView({
      spheres: {
        active: [
          Sphere.create({
            id: EntityId.create('sphere-development'),
            name: 'Разработка',
            now: new Date('2026-08-02T06:00:00.000+09:00'),
          }),
          Sphere.create({
            id: EntityId.create('sphere-growth'),
            name: 'Сфера развития',
            now: new Date('2026-08-02T06:00:00.000+09:00'),
          }),
        ],
        archived: [],
      },
      projects: options.projects ?? [],
      currentDate: DATE,
      todayScreenState,
      isStartingDay: options.isStartingDay ?? false,
      startDayError: null,
      openDayConflictState: options.openDayConflictState ?? {
        status: 'ready',
        snapshot: {
          hasConflict: false,
          openDays: [],
          unfinishedSession: null,
          unfinishedLifeAction: null,
          unfinishedSessionDayId: null,
          hasOrphanedUnfinishedSession: false,
        },
      },
      selectedKeepOpenDayId: null,
      isResolvingOpenDays: false,
      openDayRecoveryError: null,
      selectedDate,
      clock: { now: () => new Date('2026-08-02T10:00:00.000+09:00') },
      state,
      todayRecoveryStatus: options.recoveryStatus ?? 'ready',
      currentLifeActions: options.currentLifeActions ?? [],
      currentDaySessions: options.currentDaySessions ?? [],
      ...(options.tomorrowPlanSummary === undefined
        ? {}
        : { tomorrowPlanSummary: options.tomorrowPlanSummary }),
      isCurrentActionMutating: false,
      currentActionError: null,
      onRetry: NOOP,
      onRetryTodayRecovery: NOOP,
      onStartDay: NOOP,
      onRetryOpenDayConflict: NOOP,
      onSelectKeepOpenDay: NOOP,
      onResolveOpenDayConflict: NOOP,
      onOpenEveningReview: NOOP,
      onOpenPreviousDay: NOOP,
      onOpenNextDay: NOOP,
      onOpenToday: NOOP,
      onDateChange: NOOP,
      onPlanTomorrow: NOOP,
      onOpenForm: NOOP,
      onCloseForm: NOOP,
      onKindChange: NOOP,
      onTitleChange: NOOP,
      onExpectedResultChange: NOOP,
      onSubmit: NOOP,
      onOpenDecision: NOOP,
      onCloseDecision: NOOP,
      onRetryDecision: NOOP,
      onOpenLifeActionForm: NOOP,
      onCloseLifeActionForm: NOOP,
      onLifeActionTitleChange: NOOP,
      onLifeActionExpectedResultChange: NOOP,
      onLifeActionDescriptionChange: NOOP,
      onLifeActionSubmit: NOOP,
      onOpenDecisionConfirmationForm: NOOP,
      onCloseDecisionConfirmationForm: NOOP,
      onDecisionActualResultChange: NOOP,
      onDecisionConfirmationSubmit: NOOP,
      onOpenDecisionEditForm: NOOP,
      onCloseDecisionEditForm: NOOP,
      onDecisionEditTextChange: NOOP,
      onDecisionEditKindChange: NOOP,
      onDecisionEditPriorityChange: NOOP,
      onDecisionEditSubmit: NOOP,
      onOpenDecisionCancellation: NOOP,
      onCloseDecisionCancellation: NOOP,
      onConfirmDecisionCancellation: NOOP,
      onOpenDecisionRescheduleForm: NOOP,
      onCloseDecisionRescheduleForm: NOOP,
      onDecisionRescheduleDateChange: NOOP,
      onDecisionRescheduleReasonChange: NOOP,
      onDecisionRescheduleSubmit: NOOP,
      onOpenLifeAction: NOOP,
      onStartCurrentAction: NOOP,
      onPauseCurrentAction: NOOP,
      onResumeCurrentAction: NOOP,
      onCompleteCurrentActionSession: NOOP,
      onRescheduleCurrentAction: NOOP,
      onCancelCurrentAction: NOOP,
      onSelectCurrentAction: NOOP,
      onBackToDecision: NOOP,
      onRetryLifeAction: NOOP,
      onStartSession: NOOP,
      onPauseSession: NOOP,
      onResumeSession: NOOP,
      onOpenSessionCompletionForm: NOOP,
      onCloseSessionCompletionForm: NOOP,
      onSessionResultNoteChange: NOOP,
      onSessionCompletionKindChange: NOOP,
      onActionCompletionChoiceChange: NOOP,
      onActionActualResultChange: NOOP,
      onCompleteSession: NOOP,
      onRetryLifeActionCompletion: NOOP,
      onOpenLifeActionEditForm: NOOP,
      onCloseLifeActionEditForm: NOOP,
      onLifeActionEditTitleChange: NOOP,
      onLifeActionEditDescriptionChange: NOOP,
      onLifeActionEditExpectedResultChange: NOOP,
      onLifeActionEditSubmit: NOOP,
      onOpenLifeActionCancellation: NOOP,
      onCloseLifeActionCancellation: NOOP,
      onConfirmLifeActionCancellation: NOOP,
      onOpenLifeActionRescheduleForm: NOOP,
      onCloseLifeActionRescheduleForm: NOOP,
      onLifeActionRescheduleDateChange: NOOP,
      onLifeActionRescheduleSubmit: NOOP,
    }),
  );
}
