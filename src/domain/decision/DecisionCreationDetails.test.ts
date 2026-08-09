import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { Decision } from './Decision';
import { DECISION_KIND } from './DecisionKind';
import { DECISION_PRIORITY, type DecisionPriority } from './DecisionPriority';
import { DecisionTitle } from './DecisionTitle';

const NOW = new Date('2026-08-05T10:00:00.000Z');

function createDecision(overrides: Partial<Parameters<typeof Decision.createDraft>[0]> = {}) {
  return Decision.createDraft({
    id: EntityId.create('decision-creation-details'),
    title: DecisionTitle.create('Создать полный сценарий'),
    kind: DECISION_KIND.additional,
    occurredAt: NOW,
    eventId: EntityId.create('decision-creation-details-event'),
    ...overrides,
  });
}

describe('сведения создания решения', () => {
  it('нормализует причину, сферу, цену, жертвы и связь с проектом', () => {
    const decision = createDecision({
      reason: '  Причина  ',
      sphereId: EntityId.create('sphere-growth'),
      price: '  90 минут  ',
      sacrifices: '  Отказ от отвлечений  ',
      priority: DECISION_PRIORITY.high,
      projectReference: '  LifeOS  ',
    });

    expect(decision.reason).toBe('Причина');
    expect(decision.sphereId?.toString()).toBe('sphere-growth');
    expect(decision.price).toBe('90 минут');
    expect(decision.sacrifices).toBe('Отказ от отвлечений');
    expect(decision.priority).toBe(DECISION_PRIORITY.high);
    expect(decision.projectReference).toBe('LifeOS');
  });

  it('использует обычный приоритет и null для незаполненных необязательных полей', () => {
    const decision = createDecision({
      reason: '   ',
      sphereId: null,
      price: '\n',
      sacrifices: ' ',
      projectReference: '\t',
    });

    expect(decision.reason).toBeNull();
    expect(decision.sphereId).toBeNull();
    expect(decision.price).toBeNull();
    expect(decision.sacrifices).toBeNull();
    expect(decision.priority).toBe(DECISION_PRIORITY.normal);
    expect(decision.projectReference).toBeNull();
  });

  it.each([
    ['reason', 'x'.repeat(1_001), 'decision.invalid_reason'],
    ['price', 'x'.repeat(501), 'decision.invalid_price'],
    ['sacrifices', 'x'.repeat(1_001), 'decision.invalid_sacrifices'],
    ['projectReference', 'x'.repeat(201), 'decision.invalid_project_reference'],
  ] as const)('отклоняет слишком длинное поле %s', (field, value, code) => {
    expect(() => createDecision({ [field]: value })).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('отклоняет неизвестный приоритет', () => {
    const invalidPriority = 'urgent' as DecisionPriority;

    expect(() => createDecision({ priority: invalidPriority })).toThrowError(
      expect.objectContaining({ code: 'decision.invalid_priority' }),
    );
    expect(() => createDecision({ priority: invalidPriority })).toThrow(DomainError);
  });
});
