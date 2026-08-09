import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate, DECISION_KIND, DECISION_PRIORITY } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
  errorsForDecisionCreationCode,
  hasDecisionCreationErrors,
  submitDecisionCreation,
  validateDecisionCreationForm,
} from './DecisionCreationFormState';

const CURRENT_DATE = DayDate.create('2026-08-05');

function validForm() {
  return {
    ...createDecisionCreationForm(CURRENT_DATE),
    title: 'Выпустить форму создания решения',
    reason: 'Нужен полный контур решений',
    expectedResult: 'Решение сохраняется после F5',
    sphereId: 'sphere-development',
    price: 'Два часа',
    sacrifices: 'Отложить украшения',
    priority: DECISION_PRIORITY.high,
    projectReference: 'LifeOS',
  } as const;
}

describe('DecisionCreationFormState', () => {
  it('создаёт форму главного решения с выбранной датой и обычным приоритетом', () => {
    const form = createDecisionCreationForm(CURRENT_DATE);

    expect(form.kind).toBe(DECISION_KIND.main);
    expect(form.plannedDate).toBe('2026-08-05');
    expect(form.priority).toBe(DECISION_PRIORITY.normal);
    expect(form.title).toBe('');
  });

  it('показывает ошибки рядом с обязательными полями и запрещает прошлую дату', () => {
    const validation = validateDecisionCreationForm(
      {
        ...createDecisionCreationForm(CURRENT_DATE),
        plannedDate: '2026-08-04',
        title: ' ',
        expectedResult: '',
      },
      CURRENT_DATE,
    );

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors.plannedDate).toBe('Нельзя создать решение на прошедшую дату');
      expect(validation.errors.title).toBe('Введите формулировку решения');
      expect(validation.errors.expectedResult).toBe('Укажите ожидаемый результат главного решения');
      expect(hasDecisionCreationErrors(validation.errors)).toBe(true);
    }
  });

  it('разрешает дополнительное решение без ожидаемого результата', () => {
    const validation = validateDecisionCreationForm(
      {
        ...createDecisionCreationForm(CURRENT_DATE),
        kind: DECISION_KIND.additional,
        title: 'Дополнительное решение',
      },
      CURRENT_DATE,
    );

    expect(validation).toMatchObject({ ok: true });
  });

  it('проверяет максимальную длину каждого расширенного поля', () => {
    const validation = validateDecisionCreationForm(
      {
        ...validForm(),
        reason: 'x'.repeat(1_001),
        sphereId: 'sphere-development',
        price: 'x'.repeat(501),
        sacrifices: 'x'.repeat(1_001),
        projectReference: 'x'.repeat(201),
      },
      CURRENT_DATE,
    );

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors.reason).not.toBeNull();
      expect(validation.errors.sphereId).toBeNull();
      expect(validation.errors.price).not.toBeNull();
      expect(validation.errors.sacrifices).not.toBeNull();
      expect(validation.errors.projectReference).not.toBeNull();
    }
  });

  it('передаёт прикладной команде все поля и возвращает созданное решение', async () => {
    const decision = createPlannedDecision('created-from-full-form', CURRENT_DATE);
    const execute = vi.fn().mockResolvedValue({ ok: true, value: decision });

    const result = await submitDecisionCreation({
      form: validForm(),
      currentDate: CURRENT_DATE,
      createDecisionForDate: { execute },
    });

    expect(result).toEqual({ ok: true, decision });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      title: 'Выпустить форму создания решения',
      kind: DECISION_KIND.main,
      plannedDate: expect.objectContaining({}),
      expectedResult: 'Решение сохраняется после F5',
      reason: 'Нужен полный контур решений',
      sphereId: 'sphere-development',
      price: 'Два часа',
      sacrifices: 'Отложить украшения',
      priority: DECISION_PRIORITY.high,
      projectReference: 'LifeOS',
    });
    expect(execute.mock.calls[0]?.[0].plannedDate.toString()).toBe('2026-08-05');
  });

  it('не вызывает команду при ошибке формы', async () => {
    const execute = vi.fn();

    const result = await submitDecisionCreation({
      form: createDecisionCreationForm(CURRENT_DATE),
      currentDate: CURRENT_DATE,
      createDecisionForDate: { execute },
    });

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('привязывает предметные ошибки к конкретным полям', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      error: new DomainError('decision.duplicate_for_date', 'duplicate'),
    });

    const result = await submitDecisionCreation({
      form: validForm(),
      currentDate: CURRENT_DATE,
      createDecisionForDate: { execute },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBe('Такое решение уже существует на выбранную дату');
      expect(result.errors.form).toBeNull();
    }
  });

  it('возвращает безопасную общую ошибку для неизвестного кода', () => {
    const errors = errorsForDecisionCreationCode('unknown');

    expect(errors.form).toBe('Не удалось создать решение');
    expect(hasDecisionCreationErrors(createEmptyDecisionCreationErrors())).toBe(false);
  });
});
