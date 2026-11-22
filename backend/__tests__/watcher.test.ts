import { EventWatcher } from '../src/watcher';

// Mock the Horizon HTTP client used by watcher.ts
jest.mock('../src/horizon', () => ({
  fetchContractEvents: jest.fn(),
}));

import { fetchContractEvents } from '../src/horizon';

const mockedFetch = fetchContractEvents as jest.MockedFunction<
  typeof fetchContractEvents
>;

describe('EventWatcher', () => {
  let watcher: EventWatcher;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    watcher = new EventWatcher({
      contractId: 'CABC123',
      pollIntervalMs: 1000,
    });
  });

  afterEach(() => {
    watcher.stop();
    jest.useRealTimers();
  });

  describe('start/stop lifecycle', () => {
    it('starts polling and invokes the Horizon client', async () => {
      mockedFetch.mockResolvedValue([]);

      watcher.start();
      expect(watcher.isRunning()).toBe(true);

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('does not start twice when already running', async () => {
      mockedFetch.mockResolvedValue([]);

      watcher.start();
      watcher.start();

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('stops polling and clears the interval', async () => {
      mockedFetch.mockResolvedValue([]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      watcher.stop();
      expect(watcher.isRunning()).toBe(false);

      await jest.advanceTimersByTimeAsync(5000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cursor persistence', () => {
    it('passes the cursor to the Horizon client on subsequent polls', async () => {
      mockedFetch
        .mockResolvedValueOnce([{ id: '1', pagingToken: 'cursor-1' }])
        .mockResolvedValueOnce([]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockedFetch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cursor: undefined })
      );
      expect(mockedFetch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: 'cursor-1' })
      );
    });

    it('resumes from a persisted cursor on restart', async () => {
      mockedFetch.mockResolvedValue([]);

      watcher = new EventWatcher({
        contractId: 'CABC123',
        pollIntervalMs: 1000,
        cursor: 'persisted-cursor',
      });

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'persisted-cursor' })
      );
    });
  });

  describe('event parsing', () => {
    it('emits parsed events to registered listeners', async () => {
      const handler = jest.fn();
      watcher.onEvent(handler);

      mockedFetch.mockResolvedValue([
        { id: '1', pagingToken: 'cursor-1', topic: ['transfer'] },
      ]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', topic: ['transfer'] })
      );
    });

    it('catches and logs parsing errors without stopping the watcher', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const handler = jest.fn();
      watcher.onEvent(handler);

      mockedFetch.mockResolvedValue([
        { id: 'bad', pagingToken: 'cursor-bad', topic: null },
      ]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);

      expect(errorSpy).toHaveBeenCalled();
      expect(watcher.isRunning()).toBe(true);

      errorSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('logs Horizon client errors and keeps polling', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockedFetch.mockRejectedValueOnce(new Error('network failure'));
      mockedFetch.mockResolvedValueOnce([]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(errorSpy).toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(watcher.isRunning()).toBe(true);

      errorSpy.mockRestore();
    });
  });

  describe('exponential backoff', () => {
    const originalMaxRetries = process.env.HORIZON_MAX_RETRIES;

    afterEach(() => {
      if (originalMaxRetries === undefined) {
        delete process.env.HORIZON_MAX_RETRIES;
      } else {
        process.env.HORIZON_MAX_RETRIES = originalMaxRetries;
      }
    });

    // Base delays (ms) before jitter is applied: 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped)
    const BASE_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

    it('applies exponential backoff with jitter on consecutive failures', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      process.env.HORIZON_MAX_RETRIES = '10';

      watcher = new EventWatcher({
        contractId: 'CABC123',
        pollIntervalMs: 1000,
      });

      mockedFetch.mockRejectedValue(new Error('network failure'));

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      for (let attempt = 0; attempt < BASE_DELAYS.length; attempt++) {
        const base = BASE_DELAYS[attempt];

        // Just before the minimum jittered delay, no new attempt should occur.
        await jest.advanceTimersByTimeAsync(base - 1);
        expect(mockedFetch).toHaveBeenCalledTimes(attempt + 1);

        // Advancing past the maximum jittered delay guarantees a retry.
        await jest.advanceTimersByTimeAsync(base + 1);
        expect(mockedFetch).toHaveBeenCalledTimes(attempt + 2);
      }

      errorSpy.mockRestore();
    });

    it('caps the backoff delay at 60s', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      process.env.HORIZON_MAX_RETRIES = '20';

      watcher = new EventWatcher({
        contractId: 'CABC123',
        pollIntervalMs: 1000,
      });

      mockedFetch.mockRejectedValue(new Error('network failure'));

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Walk through the progression until the cap is reached.
      for (const base of [1000, 2000, 4000, 8000, 16000, 32000]) {
        await jest.advanceTimersByTimeAsync(base + 1);
      }
      const callsBeforeCap = mockedFetch.mock.calls.length;

      // At the cap, the delay must never exceed 60s.
      await jest.advanceTimersByTimeAsync(60000 + 1);
      expect(mockedFetch.mock.calls.length).toBe(callsBeforeCap + 1);

      // And it stays capped on subsequent failures.
      await jest.advanceTimersByTimeAsync(60000 + 1);
      expect(mockedFetch.mock.calls.length).toBe(callsBeforeCap + 2);

      errorSpy.mockRestore();
    });

    it('resets the backoff state after a successful response', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      process.env.HORIZON_MAX_RETRIES = '10';

      watcher = new EventWatcher({
        contractId: 'CABC123',
        pollIntervalMs: 1000,
      });

      // Two failures push the backoff up to ~4s.
      mockedFetch.mockRejectedValueOnce(new Error('failure 1'));
      mockedFetch.mockRejectedValueOnce(new Error('failure 2'));
      mockedFetch.mockResolvedValueOnce([]);

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(3);

      // Next poll after success should be back to the base poll interval.
      mockedFetch.mockRejectedValueOnce(new Error('failure 3'));
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(4);

      // After the reset, the first retry delay is back to ~1s, not ~8s.
      await jest.advanceTimersByTimeAsync(1000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(5);

      errorSpy.mockRestore();
    });

    it('stops the watcher after HORIZON_MAX_RETRIES consecutive failures', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      process.env.HORIZON_MAX_RETRIES = '3';

      watcher = new EventWatcher({
        contractId: 'CABC123',
        pollIntervalMs: 1000,
      });

      mockedFetch.mockRejectedValue(new Error('network failure'));

      watcher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Retry 1 (~1s), retry 2 (~2s), retry 3 (~4s) exhausts the budget.
      await jest.advanceTimersByTimeAsync(1000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(4000 + 1);
      expect(mockedFetch).toHaveBeenCalledTimes(4);

      expect(watcher.isRunning()).toBe(false);

      // No further polling once stopped.
      await jest.advanceTimersByTimeAsync(120000);
      expect(mockedFetch).toHaveBeenCalledTimes(4);

      errorSpy.mockRestore();
    });
  });
});
