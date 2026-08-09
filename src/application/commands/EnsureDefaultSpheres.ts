import { EntityId, Sphere, type SphereCreationData } from '../../domain';
import type { Clock } from '../ports/Clock';
import type { SphereRepository } from '../ports/SphereRepository';

export interface DefaultSphereDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
}

export const DEFAULT_SPHERES: readonly DefaultSphereDefinition[] = Object.freeze([
  { id: 'sphere-default-health', name: 'Здоровье', icon: '❤', color: '#d95d68' },
  { id: 'sphere-default-money', name: 'Деньги', icon: '₽', color: '#5b9367' },
  { id: 'sphere-default-relationships', name: 'Отношения', icon: '☺', color: '#d4779d' },
  { id: 'sphere-default-growth', name: 'Развитие', icon: '↑', color: '#6b78c7' },
  { id: 'sphere-default-home', name: 'Дом', icon: '⌂', color: '#b77a4e' },
  { id: 'sphere-default-work', name: 'Работа', icon: '▣', color: '#557f9e' },
]);

export class EnsureDefaultSpheres {
  public constructor(
    readonly repository: SphereRepository,
    readonly clock: Clock,
  ) {}

  public async execute(): Promise<readonly Sphere[]> {
    for (const definition of DEFAULT_SPHERES) {
      const data: SphereCreationData = {
        id: EntityId.create(definition.id),
        name: definition.name,
        icon: definition.icon,
        color: definition.color,
        now: this.clock.now(),
      };
      await this.repository.createIfNameAvailable(Sphere.create(data));
    }
    return this.repository.findAll();
  }
}
