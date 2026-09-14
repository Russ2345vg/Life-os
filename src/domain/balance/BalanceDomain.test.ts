import { describe, expect, it } from 'vitest';
import { Sphere } from '../sphere/Sphere';
import { Direction } from '../direction/Direction';
import { EntityId } from '../shared/EntityId';

const now = new Date('2026-09-14T00:00:00Z');
describe('life balance aggregate contracts', () => {
  it('preserves existing sphere description, icon and color when changing wheel settings', () => {
    const sphere = Sphere.create({
      id: EntityId.create('s'),
      name: 'Здоровье',
      description: 'Мой контекст',
      icon: 'heart',
      color: '#123456',
      now,
    });
    expect(sphere.update({ name: sphere.name, includeInBalanceWheel: true }, now)).toMatchObject({
      description: 'Мой контекст',
      icon: 'heart',
      color: '#123456',
    });
    expect(
      sphere.update({ name: sphere.name, description: null, icon: null, color: null }, now),
    ).toMatchObject({ description: null, icon: null, color: null });
  });
  it('keeps legacy spheres valid with unknown state and explicit wheel opt-in', () => {
    const sphere = Sphere.create({ id: EntityId.create('s'), name: 'Здоровье', now });
    expect(sphere.manualScore).toBeNull();
    expect(sphere.desiredLevel).toBeNull();
    expect(sphere.importance).toBe('normal');
    expect(sphere.includeInBalanceWheel).toBe(false);
  });
  it('keeps zero manual score independent from desired level and preserves settings on edits', () => {
    const sphere = Sphere.create({
      id: EntityId.create('s'),
      name: 'Здоровье',
      now,
      manualScore: 0,
      desiredLevel: 8,
      importance: 'critical',
      includeInBalanceWheel: true,
    });
    const edited = sphere.update({ name: 'Тело' }, now);
    expect(edited.manualScore).toBe(0);
    expect(edited.desiredLevel).toBe(8);
    expect(edited.importance).toBe('critical');
    expect(edited.includeInBalanceWheel).toBe(true);
    expect(edited.update({ name: 'Тело', manualScore: null }, now).manualScore).toBeNull();
  });
  it('allows maintain without any goal and keeps mode independent of lifecycle', () => {
    const direction = Direction.create({
      id: EntityId.create('d'),
      name: 'Сон',
      now,
      mode: 'maintain',
    });
    expect(direction.currentStateText).toBeNull();
    expect(direction.desiredState).toBeNull();
    expect(direction.status).toBe('active');
    const paused = direction.update(
      { name: 'Сон', status: 'paused', currentStateText: ' Устаю ' },
      now,
    );
    expect(paused.status).toBe('paused');
    expect(paused.mode).toBe('maintain');
    expect(paused.currentStateText).toBe('Устаю');
    expect(paused.archive(now).restore(now).mode).toBe('maintain');
  });
  it('rejects invalid finite scores and importance', () => {
    for (const manualScore of [-1, 11, NaN, Infinity])
      expect(() =>
        Sphere.create({ id: EntityId.create('s'), name: 'Сфера', now, manualScore }),
      ).toThrow();
    expect(() =>
      Direction.create({ id: EntityId.create('d'), name: 'Сон', now, manualScore: 11 }),
    ).toThrow();
  });
});
