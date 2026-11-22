import { useEffect, useRef } from 'react';

interface PollingOptions {
  interval?: number;   // ms between polls, default 15000
  enabled?: boolean;   // pause polling when false
}

/**
 * Calls `fn` immediately and then every `interval` ms.
 * On failure it backs off exponentially (up to 4x interval) then retries.
 * The callback is stored in a ref so the latest version is always invoked,
 * even if its reference changes between renders. The effect restarts
 * cleanly only when `interval` or `enabled` changes.
 */
export function usePolling(fn: () => Promise<void>, { interval = 15_000, enabled = true }: PollingOptions = {}) {
  const fnRef = useRef(fn);

  // Keep the ref pointing at the latest callback on every render.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const backoffRef = useRef(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    backoffRef.current = 1;
    let cancelled = false;

    const run = async () => {
      try {
        await fnRef.current();
        backoffRef.current = 1;
      } catch {
        backoffRef.current = Math.min(backoffRef.current * 2, 4);
      }
      if (cancelled) return;
      timerRef.current = setTimeout(run, interval * backoffRef.current);
    };

    // Fire immediately, then schedule subsequent polls.
    run();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, interval]);
}