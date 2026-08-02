import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createLifeOsApplication, type LifeOsApplication } from '../composition';
import { LifeOsApplicationContext } from './LifeOsApplicationContext';

interface LifeOsApplicationProviderProps {
  readonly children: ReactNode;
  readonly loadingFallback: ReactNode;
  readonly errorFallback: (error: Error) => ReactNode;
  readonly createApplication?: () => Promise<LifeOsApplication>;
}

interface StartupResource {
  generation: number;
  readonly promise: Promise<LifeOsApplication>;
  application: LifeOsApplication | null;
}

type StartupState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly application: LifeOsApplication }
  | { readonly status: 'error'; readonly error: Error };

export function LifeOsApplicationProvider({
  children,
  loadingFallback,
  errorFallback,
  createApplication = createLifeOsApplication,
}: LifeOsApplicationProviderProps) {
  const createApplicationRef = useRef(createApplication);
  const startupResourceRef = useRef<StartupResource | null>(null);
  const [state, setState] = useState<StartupState>({ status: 'loading' });

  useEffect(() => {
    const startupResource =
      startupResourceRef.current ?? createStartupResource(createApplicationRef.current);
    startupResourceRef.current = startupResource;
    startupResource.generation += 1;
    const generation = startupResource.generation;
    let active = true;

    void startupResource.promise.then(
      (application) => {
        startupResource.application = application;
        if (active) {
          setState({ status: 'ready', application });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({ status: 'error', error: normalizeError(error) });
        }
      },
    );

    return () => {
      active = false;
      queueMicrotask(() => {
        if (startupResource.generation !== generation) {
          return;
        }

        if (startupResource.application !== null) {
          startupResource.application.close();
          return;
        }

        void startupResource.promise.then(
          (application) => application.close(),
          () => undefined,
        );
      });
    };
  }, []);

  if (state.status === 'loading') {
    return loadingFallback;
  }

  if (state.status === 'error') {
    return errorFallback(state.error);
  }

  return <LifeOsApplicationContext value={state.application}>{children}</LifeOsApplicationContext>;
}

function createStartupResource(
  createApplication: () => Promise<LifeOsApplication>,
): StartupResource {
  return {
    generation: 0,
    promise: createApplication(),
    application: null,
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Неизвестная ошибка запуска LifeOS.');
}
