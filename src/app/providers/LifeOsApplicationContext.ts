import { createContext, useContext } from 'react';
import type { LifeOsApplication } from '../composition';

export const LifeOsApplicationContext = createContext<LifeOsApplication | null>(null);

export function useLifeOsApplication(): LifeOsApplication {
  const application = useContext(LifeOsApplicationContext);

  if (application === null) {
    throw new Error('LifeOsApplication доступен только внутри LifeOsApplicationProvider.');
  }

  return application;
}
