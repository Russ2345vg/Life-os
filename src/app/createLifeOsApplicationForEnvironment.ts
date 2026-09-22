import { createLifeOsApplication, type LifeOsApplication } from './composition';

export function createLifeOsApplicationForEnvironment(): Promise<LifeOsApplication> {
  return createLifeOsApplication({
    syncEnvironment: {
      VITE_LIFEOS_SUPABASE_URL: import.meta.env.VITE_LIFEOS_SUPABASE_URL,
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY,
    },
  });
}
