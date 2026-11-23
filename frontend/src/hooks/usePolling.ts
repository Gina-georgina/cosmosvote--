import { useEffect, useRef, useCallback } from 'react';

interface PollingOptions {
  interval?: number;   // ms between polls, default 15000
  enabled?: boolean;   // pause polling when false
}

/**
 * Calls `fn` immediately and then every `interval` ms.
 * On failure it backs off exponentially (up to 4x interval) then retries.
 * The effect restarts cleanly when `fn` or `enabled` changes.
 */
export function usePolling(fn: () => Promise<void>, { interval = 15_000, enabled = true }: PollingOptions = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const backoffRef = useRef(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback((delay: number) => {
    if (cancelledRef.current) return;
    timerRef.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        await fnRef.current();
        backoffRef.current = 1;
      } catch {
        backoffRef.current = Math.min(backoffRef.current * 2, 4);
      }
      if (cancelledRef.current) return;
      schedule(interval * backoffRef.current);
    }, delay);
  }, [interval]);

  useEffect(() => {
    // Skip the immediate call and scheduling entirely when disabled.
    if (!enabled) return;

    cancelledRef.current = false;
    backoffRef.current = 1;

    // Fire immediately, then schedule
    (async () => {
      try {
        await fnRef.current();
      } catch {
        backoffRef.current = 2;
      }
      if (cancelledRef.current) return;
      schedule(interval * backoffRef.current);
    })();

    return () => {
      // Mark cancelled so any in-flight async continuation won't reschedule,
      // then clear any pending timeout.
      cancelledRef.current = true;
      clearTimer();
    };
  }, [enabled, interval, schedule, clearTimer]);
}