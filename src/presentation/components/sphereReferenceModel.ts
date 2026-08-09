import { useEffect, useState } from 'react';
import type { GetSpheres, SpheresSnapshot } from '../../application';
import type { Sphere } from '../../domain';

export const SPHERE_FILTER_ALL = 'all';
export const SPHERE_FILTER_NONE = '__none__';
export const EMPTY_SPHERES: SpheresSnapshot = Object.freeze({ active: [], archived: [] });

export function useSpheres(getSpheres: Pick<GetSpheres, 'execute'>): SpheresSnapshot {
  const [snapshot, setSnapshot] = useState<SpheresSnapshot>(EMPTY_SPHERES);
  useEffect(() => {
    let cancelled = false;
    void getSpheres
      .execute()
      .then((value) => {
        if (!cancelled) setSnapshot(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getSpheres]);
  return snapshot;
}

export function findSphere(snapshot: SpheresSnapshot, sphereId: string | null): Sphere | null {
  if (sphereId === null) return null;
  return (
    [...snapshot.active, ...snapshot.archived].find(
      (sphere) => sphere.id.toString() === sphereId,
    ) ?? null
  );
}
