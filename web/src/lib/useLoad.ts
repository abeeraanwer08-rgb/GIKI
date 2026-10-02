import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Runs an async loader on mount and whenever `deps` change; ignores results from stale runs. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const run = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => id === run.current && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        id === run.current &&
        setState((s) => ({ data: s.data, error: error instanceof Error ? error.message : 'Something went wrong.', loading: false })),
    );
  }, [load]);

  useEffect(() => {
    reload();
    return () => {
      run.current++;
    };
  }, [reload]);

  return { ...state, reload };
}
