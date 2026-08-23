import { describe, expect, it, vi } from 'vitest';
import type { Direction, Project } from '../../domain';
import { createProjectReferenceLoader } from './projectReferenceLoader';

describe('project reference loader', () => {
  it('reuses reference queries while a user opens different projects', async () => {
    const getProjects = { execute: vi.fn(async (): Promise<readonly Project[]> => []) };
    const getDirections = { execute: vi.fn(async (): Promise<readonly Direction[]> => []) };
    const getSpheres = {
      execute: vi.fn(async () => ({ active: [], archived: [] })),
    };
    const loader = createProjectReferenceLoader({ getProjects, getDirections, getSpheres });

    await loader.load();
    await loader.load();

    expect(getProjects.execute).toHaveBeenCalledTimes(1);
    expect(getDirections.execute).toHaveBeenCalledTimes(1);
    expect(getSpheres.execute).toHaveBeenCalledTimes(1);
  });

  it('refreshes all reference queries after a project mutation', async () => {
    const getProjects = { execute: vi.fn(async (): Promise<readonly Project[]> => []) };
    const getDirections = { execute: vi.fn(async (): Promise<readonly Direction[]> => []) };
    const getSpheres = {
      execute: vi.fn(async () => ({ active: [], archived: [] })),
    };
    const loader = createProjectReferenceLoader({ getProjects, getDirections, getSpheres });

    await loader.load();
    await loader.refresh();

    expect(getProjects.execute).toHaveBeenCalledTimes(2);
    expect(getDirections.execute).toHaveBeenCalledTimes(2);
    expect(getSpheres.execute).toHaveBeenCalledTimes(2);
  });
});
