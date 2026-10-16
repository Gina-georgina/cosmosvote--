import { Horizon } from '@stellar/stellar-sdk';
import { GovernanceEvent, GovernanceEventType } from './types';
import { getStore, saveCursor, matchingSubscribers } from './subscriptions';
import { notify } from './notifier';

const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const CONTRACT_ID = process.env.GOVERNANCE_CONTRACT_ID ?? '';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15_000);

// Governance event topic pairs: (gov, <subtype>)
const TRACKED_TOPICS: GovernanceEventType[] = ['created', 'voted', 'final', 'exec', 'cancel'];

const server = new Horizon.Server(HORIZON_URL);

/** Parse a Horizon contract event record into a GovernanceEvent, or null if not relevant. */
function parseEvent(record: Horizon.ServerApi.ContractEventRecord): GovernanceEvent | null {
  const topics = record.topic as string[];
  if (!topics || topics.length < 2) return null;

  // Topics are XDR-encoded symbols; the raw string representation for symbol_short is the symbol value.
  const [ns, subtype] = topics.map((t) => {
    try {
      // Horizon returns topics as base64 XDR; stellar-sdk decodes them.
      // For symbol_short values they render as plain strings in .value.
      const parsed = (record as unknown as { topic: Array<{ type: string; value: string }> }).topic;
      return parsed ? undefined : t; // fallback handled below
    } catch {
      return undefined;
    }
  });

  // Use the decoded topic values directly from the record when available.
  const rawTopics = record.topic as unknown as Array<{ type: string; value: string }>;
  const nsVal = rawTopics?.[0]?.value ?? '';
  const subtypeVal = rawTopics?.[1]?.value ?? '';

  if (nsVal !== 'gov') return null;
  if (!(TRACKED_TOPICS as string[]).includes(subtypeVal)) return null;

  // Extract proposal ID from value when present (first element of the tuple for most events).
  const rawValue = record.value as unknown as { type: string; value: unknown[] } | undefined;
  const proposalId = rawValue?.value?.[0]?.toString();

  return {
    type: subtypeVal as GovernanceEventType,
    proposalId,
    ledger: record.ledger_closed_at ? Number(record.id.split('-')[0]) : 0,
    raw: record,
  };
}

async function fetchNewEvents(cursor: string): Promise<{
  events: GovernanceEvent[];
  nextCursor: string;
}> {
  const response = await (server as unknown as {
    contractEvents(params: {
      contractId: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ records: Horizon.ServerApi.ContractEventRecord[]; next_cursor?: string }>;
  }).contractEvents({
    contractId: CONTRACT_ID,
    cursor: cursor !== 'now' ? cursor : undefined,
    limit: 50,
  });

  const events: GovernanceEvent[] = [];
  let nextCursor = cursor;

  for (const record of response.records) {
    const ev = parseEvent(record);
    if (ev) events.push(ev);
    nextCursor = record.id;
  }

  return { events, nextCursor };
}

async function processEvents(events: GovernanceEvent[]): Promise<void> {
  for (const event of events) {
    const subscribers = matchingSubscribers(event.type, event.proposalId);
    await Promise.all(
      subscribers.map((sub) =>
        notify(sub, event).catch((err: unknown) =>
          console.error(`Failed to notify subscriber ${sub.id}:`, err),
        ),
      ),
    );
  }
}

/** Set to true when stopWatcher() has been called. */
let _stopping = false;

/** Resolves when the in-flight poll (and its webhook deliveries) completes. */
let _drainResolve: (() => void) | null = null;
let _drainPromise: Promise<void> = Promise.resolve();

/**
 * Signal the watcher to stop scheduling new polls.
 * Returns a promise that resolves once the current in-flight poll finishes,
 * allowing all in-flight webhook deliveries and DB writes to complete.
 */
export function stopWatcher(): Promise<void> {
  _stopping = true;
  return _drainPromise;
}

export async function startWatcher(): Promise<void> {
  if (!CONTRACT_ID) {
    throw new Error('GOVERNANCE_CONTRACT_ID is not set.');
  }

  _stopping = false;

  console.log(`[watcher] Starting. Contract: ${CONTRACT_ID}`);
  console.log(`[watcher] Polling Horizon every ${POLL_INTERVAL_MS}ms`);

  async function poll(): Promise<void> {
    if (_stopping) {
      console.log('[watcher] Stopping — skipping scheduled poll.');
      if (_drainResolve) {
        _drainResolve();
        _drainResolve = null;
      }
      return;
    }

    // Create a new drain promise for this poll cycle so that stopWatcher()
    // callers can await the completion of whatever is currently in-flight.
    _drainPromise = new Promise<void>((resolve) => {
      _drainResolve = resolve;
    });

    const { cursor } = getStore();
    try {
      const { events, nextCursor } = await fetchNewEvents(cursor);
      if (events.length > 0) {
        console.log(`[watcher] ${events.length} new event(s) found`);
        await processEvents(events);
        saveCursor(nextCursor);
      }
    } catch (err) {
      console.error('[watcher] Poll error:', err);
    } finally {
      // Resolve the drain promise — all in-flight work for this cycle is done.
      if (_drainResolve) {
        _drainResolve();
        _drainResolve = null;
      }
    }

    // Schedule the next poll only if we have not been asked to stop.
    if (!_stopping) {
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  await poll();
}
