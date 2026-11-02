import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Tiny data hook: fetch on mount, optional polling, manual refetch. Keeps the last good data
 * while refetching so screens never flash empty (DESIGN-SYSTEM §6).
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], options: { intervalMs?: number; enabled?: boolean } = {}): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = options.enabled ?? true;

  const run = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(true);
    void run();
    if (!options.intervalMs) return;
    const t = setInterval(() => void run(), options.intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, options.intervalMs, ...deps]);

  return { data, error, loading, refetch: run };
}

export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>, onSuccess?: (r: R) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mutate = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        onSuccess?.(r);
        return r;
      } catch (e) {
        setError(e);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn, onSuccess],
  );
  return { mutate, pending, error };
}
