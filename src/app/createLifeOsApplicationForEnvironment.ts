import { createLifeOsApplication, type LifeOsApplication } from './composition';

interface OptionalGoalAlbumDemoOptions<TApplication> {
  readonly isDev: boolean;
  readonly search: string;
  readonly createApplication: () => Promise<TApplication>;
  readonly seed: (application: TApplication) => Promise<void>;
}

export async function createApplicationWithOptionalGoalAlbumDemo<TApplication>({
  isDev,
  search,
  createApplication,
  seed,
}: OptionalGoalAlbumDemoOptions<TApplication>): Promise<TApplication> {
  const application = await createApplication();
  if (!shouldSeedGoalAlbumDemo(isDev, search)) return application;
  await seed(application);
  return application;
}

export async function createLifeOsApplicationForEnvironment(): Promise<LifeOsApplication> {
  const createConfiguredApplication = () =>
    createLifeOsApplication({
      syncEnvironment: {
        VITE_LIFEOS_SUPABASE_URL: import.meta.env.VITE_LIFEOS_SUPABASE_URL,
        VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY,
      },
    });
  if (!import.meta.env.DEV) return createConfiguredApplication();

  return createApplicationWithOptionalGoalAlbumDemo({
    isDev: true,
    search: window.location.search,
    createApplication: createConfiguredApplication,
    seed: async (application) => {
      const { seedGoalAlbumDemo } = await import('./dev/GoalAlbumDemoSeed');
      await seedGoalAlbumDemo(application);
    },
  });
}

function shouldSeedGoalAlbumDemo(isDev: boolean, search: string): boolean {
  return isDev && new URLSearchParams(search).get('goalAlbumDemo') === '1';
}
