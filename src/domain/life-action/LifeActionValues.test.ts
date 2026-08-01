import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { ActionActualResult } from './ActionActualResult';
import { ActionCancelReason } from './ActionCancelReason';
import { ActionExpectedResult } from './ActionExpectedResult';
import { LifeActionTitle } from './LifeActionTitle';

describe('значения LifeAction', () => {
  describe('LifeActionTitle', () => {
    it('обрезает края, представляет строкой и сравнивается по значению', () => {
      const title = LifeActionTitle.create('  Подготовить макет  ');

      expect(title.toString()).toBe('Подготовить макет');
      expect(title.equals(LifeActionTitle.create('Подготовить макет'))).toBe(true);
      expect(title.equals(LifeActionTitle.create('Проверить макет'))).toBe(false);
    });

    it.each(['', ' ', '\n\t'])('отклоняет пустое название: %j', (value) => {
      expect(() => LifeActionTitle.create(value)).toThrow(DomainError);
    });

    it('принимает 200 символов и отклоняет более длинное название', () => {
      expect(LifeActionTitle.create('x'.repeat(200)).toString()).toHaveLength(200);
      expect(() => LifeActionTitle.create('x'.repeat(201))).toThrowError(
        expect.objectContaining({ code: 'life_action_title.invalid' }),
      );
    });

    it('не позволяет внешнему свойству изменить внутреннее значение', () => {
      const title = LifeActionTitle.create('Подготовить макет');

      Reflect.set(title, 'value', 'Изменено');

      expect(title.toString()).toBe('Подготовить макет');
    });
  });

  describe('ActionExpectedResult', () => {
    it('хранит нормализованный проверяемый результат и сравнивается по значению', () => {
      const result = ActionExpectedResult.create('  Макет согласован  ');

      expect(result.toString()).toBe('Макет согласован');
      expect(result.equals(ActionExpectedResult.create('Макет согласован'))).toBe(true);
      expect(result.equals(ActionExpectedResult.create('Макет опубликован'))).toBe(false);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => ActionExpectedResult.create('   ')).toThrow(DomainError);
      expect(ActionExpectedResult.create('x'.repeat(1_000)).toString()).toHaveLength(1_000);
      expect(() => ActionExpectedResult.create('x'.repeat(1_001))).toThrow(DomainError);
    });

    it('остаётся неизменяемым', () => {
      const result = ActionExpectedResult.create('Макет согласован');
      Reflect.set(result, 'value', 'Изменено');

      expect(result.toString()).toBe('Макет согласован');
    });
  });

  describe('ActionActualResult', () => {
    it('хранит отдельный нормализованный фактический результат', () => {
      const result = ActionActualResult.create('  Согласованы два экрана  ');

      expect(result.toString()).toBe('Согласованы два экрана');
      expect(result.equals(ActionActualResult.create('Согласованы два экрана'))).toBe(true);
      expect(result.equals(ActionActualResult.create('Согласованы три экрана'))).toBe(false);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => ActionActualResult.create('')).toThrow(DomainError);
      expect(ActionActualResult.create('x'.repeat(2_000)).toString()).toHaveLength(2_000);
      expect(() => ActionActualResult.create('x'.repeat(2_001))).toThrow(DomainError);
    });

    it('остаётся неизменяемым', () => {
      const result = ActionActualResult.create('Согласованы два экрана');
      Reflect.set(result, 'value', 'Изменено');

      expect(result.toString()).toBe('Согласованы два экрана');
    });
  });

  describe('ActionCancelReason', () => {
    it('хранит нормализованную причину и сравнивается по значению', () => {
      const reason = ActionCancelReason.create('  Результат больше не нужен  ');

      expect(reason.toString()).toBe('Результат больше не нужен');
      expect(reason.equals(ActionCancelReason.create('Результат больше не нужен'))).toBe(true);
      expect(reason.equals(ActionCancelReason.create('Изменились условия'))).toBe(false);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => ActionCancelReason.create(' \n ')).toThrow(DomainError);
      expect(ActionCancelReason.create('x'.repeat(1_000)).toString()).toHaveLength(1_000);
      expect(() => ActionCancelReason.create('x'.repeat(1_001))).toThrow(DomainError);
    });

    it('остаётся неизменяемым', () => {
      const reason = ActionCancelReason.create('Результат больше не нужен');
      Reflect.set(reason, 'value', 'Изменено');

      expect(reason.toString()).toBe('Результат больше не нужен');
    });
  });
});
