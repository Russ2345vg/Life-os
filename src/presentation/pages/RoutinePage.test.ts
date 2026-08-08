import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CreateRoutineBlock,
  DeleteRoutineBlock,
  GetRoutineBlocksForDate,
  resolveRoutinePlanFactPresentation,
  UpdateRoutineBlock,
} from '../../application';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineOccurrenceOverride,
  RoutineOccurrenceExecution,
  resolveRoutineOccurrencesForDate,
} from '../../domain';
import { InMemoryRoutineBlockRepository } from '../../infrastructure';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { RoutineBlockForm } from '../routine/RoutineBlockForm';
import { createEmptyRoutineBlockForm } from '../routine/RoutineBlockFormState';
import { findRoutineBlockOverlaps } from '../routine/RoutineBlockOverlaps';
import { deviationLabel, deviationTitle } from '../routine/RoutineDeviationPresentation';
import { RoutinePage, RoutinePlanFact, RoutineRecoveryPanel } from './RoutinePage';

const DATE = DayDate.create('2026-08-08');

function block(id: string, title: string, startTime: string, endTime: string): RoutineBlock {
  return RoutineBlock.create({
    id: EntityId.create(id),
    anchorDate: DATE,
    title,
    startTime,
    endTime,
    category: ROUTINE_BLOCK_CATEGORY.work,
    recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
    required: false,
    now: new Date('2026-08-08T00:00:00.000Z'),
  });
}

describe('RoutinePage', () => {
  it('renders the empty state and create action in the responsive section layout', () => {
    const repository = new InMemoryRoutineBlockRepository();
    const clock = new FakeClock(new Date('2026-08-08T00:00:00.000Z'));
    const markup = renderToStaticMarkup(
      createElement(RoutinePage, {
        currentDate: DATE,
        selectedDate: DATE,
        onDateChange: () => undefined,
        createRoutineBlock: new CreateRoutineBlock(repository, clock, new FakeIdGenerator()),
        updateRoutineBlock: new UpdateRoutineBlock(repository, clock),
        deleteRoutineBlock: new DeleteRoutineBlock(repository),
        getRoutineBlocksForDate: new GetRoutineBlocksForDate(repository),
      }),
    );
    expect(markup).toContain('routine-page');
    expect(markup).toContain('На этот день распорядок пока не составлен.');
    expect(markup.match(/Создать блок/g)?.length).toBe(2);
  });

  it('identifies and names conflicting intervals without blocking them', () => {
    const overlaps = findRoutineBlockOverlaps([
      block('one', 'Фокус', '09:00', '10:30'),
      block('two', 'Звонок', '10:00', '11:00'),
      block('three', 'Обед', '12:00', '13:00'),
    ]);
    expect(overlaps).toEqual(['09:00–10:30 «Фокус» и 10:00–11:00 «Звонок»']);
  });

  it.each([
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed, 'Начало перенесено с 09:00'],
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped, 'Пропущено'],
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled, 'Перенесено на'],
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened, 'Сокращено с'],
    [ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction, 'Действие заменено'],
  ] as const)('shows a clear %s deviation label', (type, expected) => {
    const source = block(
      'label-block',
      'Длинное название блока для мобильного экрана',
      '09:00',
      '11:00',
    );
    const details =
      type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed
        ? { startTimeOverride: '09:30' }
        : type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled
          ? { targetDate: DayDate.create('2026-08-09'), targetStartTime: '14:00' }
          : type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened
            ? { endTimeOverride: '10:00' }
            : type === ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction
              ? { replacementActionId: EntityId.create('replacement') }
              : {};
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create(`override-${type}`),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      type,
      ...details,
      now: new Date('2026-08-08T00:00:00.000Z'),
    });
    const occurrence = resolveRoutineOccurrencesForDate([source], [override], DATE)[0]!;
    expect(deviationTitle(type)).not.toHaveLength(0);
    expect(deviationLabel(occurrence)).toContain(expected);
  });

  it('ignores skipped cards when calculating overlap warnings', () => {
    expect(
      findRoutineBlockOverlaps([
        { ...block('one', 'Фокус', '09:00', '10:30'), isSkipped: true },
        block('two', 'Звонок', '10:00', '11:00'),
      ]),
    ).toEqual([]);
  });

  it('renders compact separate plan and fact zones with neutral deviations', () => {
    const source = block('plan-fact', 'Фокус', '08:00', '09:00');
    const occurrence = resolveRoutineOccurrencesForDate([source], [], DATE)[0]!;
    const execution = RoutineOccurrenceExecution.rehydrate({
      id: EntityId.create('execution-plan-fact'),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      actualStartedAt: new Date('2026-08-08T08:12:00'),
      actualEndedAt: new Date('2026-08-08T08:52:00'),
      status: 'completed',
      note: null,
      createdAt: new Date('2026-08-08T08:12:00'),
      updatedAt: new Date('2026-08-08T08:52:00'),
      version: 2,
    });
    const item = resolveRoutinePlanFactPresentation(
      occurrence,
      execution,
      new Date('2026-08-08T10:00:00'),
    );
    const markup = renderToStaticMarkup(createElement(RoutinePlanFact, { item, occurrence }));
    expect(markup).toContain('План');
    expect(markup).toContain('08:00–09:00');
    expect(markup).toContain('Факт');
    expect(markup).toContain('08:12–08:52');
    expect(markup).toContain('Начато на 12 мин позже');
    expect(markup).toContain('На 20 мин короче плана');
    expect(markup).not.toContain('<table');
  });

  it('shows recovery facts and exposes only complete and abandon actions', () => {
    const source = block('recovery-plan', 'Фокус прошлого дня', '08:00', '09:00');
    const occurrence = resolveRoutineOccurrencesForDate([source], [], DATE)[0]!;
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('recovery-running'),
      routineBlockId: source.id,
      occurrenceDate: DATE,
      occurredAt: new Date('2026-08-08T08:12:00'),
    });
    const markup = renderToStaticMarkup(
      createElement(RoutineRecoveryPanel, {
        item: { execution, occurrence },
        isResolving: false,
        onComplete: () => undefined,
        onAbandon: () => undefined,
      }),
    );

    expect(markup).toContain('Восстановление выполнения');
    expect(markup).toContain('Фокус прошлого дня');
    expect(markup).toContain('08:00–09:00');
    expect(markup).toContain('actualStartedAt');
    expect(markup).toContain('08.08.2026, 08:12');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('Завершить');
    expect(markup).toContain('Прервать');
    expect(markup).not.toContain('Начать блок');
    expect(markup).not.toContain('Изменить');
  });
});

describe('RoutineBlockForm', () => {
  it('renders every stage 13.1 field including weekday selection', () => {
    const form = {
      ...createEmptyRoutineBlockForm(DATE),
      recurrence: ROUTINE_BLOCK_RECURRENCE.selectedWeekdays,
      selectedWeekdays: [1, 3] as const,
    };
    const markup = renderToStaticMarkup(
      createElement(RoutineBlockForm, {
        form,
        errors: {},
        submitError: null,
        isEditing: false,
        isSaving: false,
        onChange: () => undefined,
        onCancel: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    for (const label of [
      'Название',
      'Дата начала правила',
      'Категория',
      'Начало',
      'Окончание',
      'Повторяемость',
      'Дни недели',
      'Обязательный блок',
      'Назначение',
      'Напоминание',
      'Существующее действие',
      'Создать действие',
      'Вечерний контроль',
      'Прогулка',
    ])
      expect(markup).toContain(label);
    expect(markup).toContain('Пн');
    expect(markup).toContain('Вс');
  });

  it('keeps a long title in the form and disables controls while saving', () => {
    const longTitle =
      'Очень длинное название блока распорядка, которое должно переноситься в узком окне без горизонтального переполнения';
    const form = {
      ...createEmptyRoutineBlockForm(DATE),
      title: longTitle,
      startTime: '09:00',
      endTime: '10:00',
    };
    const markup = renderToStaticMarkup(
      createElement(RoutineBlockForm, {
        form,
        errors: {},
        submitError: null,
        isEditing: true,
        isSaving: true,
        onChange: () => undefined,
        onCancel: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(markup).toContain(longTitle);
    expect(markup).toContain('routine-form-grid');
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThan(5);
    expect(markup).toContain('Сохраняем…');
  });
});
