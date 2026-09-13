import { describe, expect, it, vi } from 'vitest';
import { createApplicationWithOptionalGoalAlbumDemo } from './createLifeOsApplicationForEnvironment';

describe('environment application bootstrap', () => {
  it('runs the Goal Album seed only for the explicit DEV opt-in query', async () => {
    const application = { kind: 'application' } as const;
    const seed = vi.fn<(value: typeof application) => Promise<void>>().mockResolvedValue();

    await expect(
      createApplicationWithOptionalGoalAlbumDemo({
        isDev: true,
        search: '?goalAlbumDemo=1',
        createApplication: async () => application,
        seed,
      }),
    ).resolves.toBe(application);

    expect(seed).toHaveBeenCalledOnce();
    expect(seed).toHaveBeenCalledWith(application);
  });

  it.each([
    { name: 'production build', isDev: false, search: '?goalAlbumDemo=1' },
    { name: 'ordinary DEV URL', isDev: true, search: '' },
    { name: 'wrong opt-in value', isDev: true, search: '?goalAlbumDemo=true' },
  ])('does not seed for $name', async ({ isDev, search }) => {
    const application = { kind: 'application' } as const;
    const seed = vi.fn<(value: typeof application) => Promise<void>>().mockResolvedValue();

    await createApplicationWithOptionalGoalAlbumDemo({
      isDev,
      search,
      createApplication: async () => application,
      seed,
    });

    expect(seed).not.toHaveBeenCalled();
  });
});
