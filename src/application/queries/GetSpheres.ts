import { SPHERE_STATUS, type Sphere } from '../../domain';
import type { SphereRepository } from '../ports/SphereRepository';

export interface SpheresSnapshot {
  readonly active: readonly Sphere[];
  readonly archived: readonly Sphere[];
}

export class GetSpheres {
  public constructor(readonly repository: SphereRepository) {}

  public async execute(): Promise<SpheresSnapshot> {
    const spheres = await this.repository.findAll();
    return {
      active: sortSpheres(spheres.filter((sphere) => sphere.status === SPHERE_STATUS.active)),
      archived: sortSpheres(spheres.filter((sphere) => sphere.status === SPHERE_STATUS.archived)),
    };
  }
}

function sortSpheres(spheres: readonly Sphere[]): readonly Sphere[] {
  return [...spheres].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}
