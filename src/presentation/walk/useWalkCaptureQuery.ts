import { useEffect, useState } from 'react';

export type WalkCaptureQueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error' };

/** Repository-backed read projection; no Capture mutations or optimistic domain state here. */
export function useWalkCaptureQuery<T>(load: () => Promise<T>, revision = 0) {
  const [state, setState] = useState<WalkCaptureQueryState<T>>({ status: 'loading' });
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const token = ++request;
      void load()
        .then((value) => {
          if (active && request === token) setState({ status: 'ready', value });
        })
        .catch(() => {
          if (active && request === token) setState({ status: 'error' });
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [load, revision, reloadVersion]);
  return { state, reload: () => setReloadVersion((version) => version + 1) };
}
