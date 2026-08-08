import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DayDate } from '../../domain';

export type DateQueryState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error' };

type DateQueryAction<T> =
  | { readonly type: 'loading' }
  | { readonly type: 'ready'; readonly value: T }
  | { readonly type: 'error' };

interface DateQuery<T> {
  execute(date: DayDate): Promise<T>;
}

export function useDateQuery<T>(selectedDate: DayDate, query: DateQuery<T>) {
  const generationRef = useRef(0);
  const [state, dispatch] = useReducer(
    (_currentState: DateQueryState<T>, action: DateQueryAction<T>): DateQueryState<T> => {
      switch (action.type) {
        case 'loading':
          return { status: 'loading' };
        case 'ready':
          return { status: 'ready', value: action.value };
        case 'error':
          return { status: 'error' };
      }
    },
    { status: 'loading' },
  );

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    dispatch({ type: 'loading' });

    try {
      const value = await query.execute(selectedDate);
      if (generation === generationRef.current) {
        dispatch({ type: 'ready', value });
      }
    } catch {
      if (generation === generationRef.current) {
        dispatch({ type: 'error' });
      }
    }
  }, [query, selectedDate]);

  useEffect(() => {
    void reload();

    return () => {
      generationRef.current += 1;
    };
  }, [reload]);

  return { state, reload } as const;
}
