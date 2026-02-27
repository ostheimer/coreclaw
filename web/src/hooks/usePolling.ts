import { useEffect, useState, useCallback, useRef } from "react";

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 5000,
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    const id = setInterval(() => void doFetch(), intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [doFetch, intervalMs]);

  return { data, loading, error, refresh: doFetch };
}
