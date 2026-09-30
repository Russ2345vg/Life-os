import { describe, expect, it } from 'vitest';
import { EntityId, Sphere } from '../../domain';
import { MemoryContextResolver } from './MemoryContext';

describe('memory context snapshots', () => {
  it('uses repository titles and retains the saved title after the linked entity disappears', async () => {
    let sphere: Sphere | null = Sphere.create({
      id: EntityId.create('sphere'),
      name: 'Семья',
      now: new Date(),
    });
    const resolver = new MemoryContextResolver(
      { findById: async () => sphere },
      { findById: async () => null },
      { findById: async () => null },
    );
    const candidate = {
      sphereId: 'sphere',
      sphereTitle: 'Подменённое название',
      directionId: null,
      directionTitle: null,
      goalId: null,
      goalTitle: null,
    };
    const context = await resolver.resolve(candidate, null);
    expect(context.sphereTitle).toBe('Семья');
    sphere = null;
    expect(await resolver.resolve(candidate, context)).toEqual(context);
    await expect(resolver.resolve(candidate, null)).rejects.toMatchObject({
      code: 'memory.context_missing',
    });
  });
});
