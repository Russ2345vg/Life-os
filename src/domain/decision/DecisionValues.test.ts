import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { ActualResultSummary } from './ActualResultSummary';
import { DecisionCancelReason } from './DecisionCancelReason';
import { DecisionTitle } from './DecisionTitle';
import { ExpectedResult } from './ExpectedResult';

describe('значения Decision', () => {
  describe('DecisionTitle', () => {
    it('обрезает края и сравнивается по значению', () => {
      const title = DecisionTitle.create('  Подготовить план  ');

      expect(title.toString()).toBe('Подготовить план');
      expect(title.equals(DecisionTitle.create('Подготовить план'))).toBe(true);
      expect(title.equals(DecisionTitle.create('Другой заголовок'))).toBe(false);
    });

    it.each(['', ' ', '\n\t'])('отклоняет пустое название: %j', (value) => {
      expect(() => DecisionTitle.create(value)).toThrow(DomainError);
    });

    it('ограничивает длину названия', () => {
      expect(() => DecisionTitle.create('x'.repeat(201))).toThrowError(
        expect.objectContaining({ code: 'decision_title.invalid' }),
      );
    });
  });

  describe('ExpectedResult', () => {
    it('хранит нормализованный проверяемый результат', () => {
      const result = ExpectedResult.create('  Опубликован согласованный документ  ');

      expect(result.toString()).toBe('Опубликован согласованный документ');
      expect(result.equals(ExpectedResult.create('Опубликован согласованный документ'))).toBe(true);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => ExpectedResult.create('   ')).toThrow(DomainError);
      expect(() => ExpectedResult.create('x'.repeat(1_001))).toThrow(DomainError);
    });
  });

  describe('ActualResultSummary', () => {
    it('хранит фактический результат независимо от ожидаемого', () => {
      const actual = ActualResultSummary.create('  Получены три подтверждения  ');

      expect(actual.toString()).toBe('Получены три подтверждения');
      expect(actual.equals(ActualResultSummary.create('Получены три подтверждения'))).toBe(true);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => ActualResultSummary.create('')).toThrow(DomainError);
      expect(() => ActualResultSummary.create('x'.repeat(2_001))).toThrow(DomainError);
    });
  });

  describe('DecisionCancelReason', () => {
    it('хранит неизменяемую нормализованную причину', () => {
      const reason = DecisionCancelReason.create('  Изменились исходные условия  ');

      expect(reason.toString()).toBe('Изменились исходные условия');
      expect(reason.equals(DecisionCancelReason.create('Изменились исходные условия'))).toBe(true);
    });

    it('отклоняет пустое и слишком длинное значение', () => {
      expect(() => DecisionCancelReason.create(' \n ')).toThrow(DomainError);
      expect(() => DecisionCancelReason.create('x'.repeat(1_001))).toThrow(DomainError);
    });
  });
});
