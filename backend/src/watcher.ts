import { Horizon } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { logger } from './logger';
import { db } from './db';

export interface WatcherConfig {
  horizonUrl: string;
  contractId: string;
  pollIntervalMs: number;
  cursorKey: string;
}

const SEEN_EVENTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ContractEvent {
  id: string;
  pagingToken: string;
  ledger: number;
  contractId: string;
  topic: string[];
  value: unknown;
  createdAt: string;
}

export class ContractWatcher {
  private server: Horizon.Server;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private cursor: string | null = null;

  constructor(private readonly config: WatcherConfig) {
    this.server = new Horizon.Server(config.horizonUrl);
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('ContractWatcher already running');
      return;
    }
    this.running = true;
    this.cursor = await this.loadCursor();
    await this.pruneSeenEvents();
    logger.info('ContractWatcher started', { cursor: this.cursor });
    await this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('ContractWatcher stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getCursor(): string | null {
    return this.cursor;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      await this.pruneSeenEvents();
      const events = await this.fetchEvents();
      for (const event of events) {
        await this.handleEvent(event);
      }
    } catch (err) {
      logger.error('ContractWatcher poll failed', { error: err });
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => void this.poll(), this.config.pollIntervalMs);
      }
    }
  }

  private async fetchEvents(): Promise<ContractEvent[]> {
    const builder = this.server
      .events()
      .forContract(this.config.contractId)
      .order('asc');
    if (this.cursor) {
      builder.cursor(this.cursor);
    }
    const response = await builder.call();
    return (response.records ?? []).map((record) => this.parseEvent(record));
  }

  private parseEvent(record: Horizon.ServerApi.EventRecord): ContractEvent {
    try {
      return {
        id: record.id,
        pagingToken: record.paging_token,
        ledger: record.ledger,
        contractId: record.contract_id ?? this.config.contractId,
        topic: record.topic ?? [],
        value: record.value,
        createdAt: record.created_at,
      };
    } catch (err) {
      logger.error('ContractWatcher failed to parse event', { error: err, record });
      throw err;
    }
  }

  private async handleEvent(event: ContractEvent): Promise<void> {
    try {
      const inserted = await db.markEventSeen(event.ledger, event.id);
      if (!inserted) {
        logger.debug('ContractWatcher skipping duplicate event', {
          ledger: event.ledger,
          id: event.id,
        });
        this.cursor = event.pagingToken;
        await this.saveCursor(this.cursor);
        return;
      }
      await db.saveContractEvent(event);
      this.cursor = event.pagingToken;
      await this.saveCursor(this.cursor);
    } catch (err) {
      logger.error('ContractWatcher failed to handle event', { error: err, event });
    }
  }

  private async pruneSeenEvents(): Promise<void> {
    try {
      await db.pruneSeenEvents(SEEN_EVENTS_RETENTION_MS);
    } catch (err) {
      logger.error('ContractWatcher failed to prune seen events', { error: err });
    }
  }

  private async loadCursor(): Promise<string | null> {
    try {
      return await db.getCursor(this.config.cursorKey);
    } catch (err) {
      logger.error('ContractWatcher failed to load cursor', { error: err });
      return null;
    }
  }

  private async saveCursor(cursor: string): Promise<void> {
    try {
      await db.setCursor(this.config.cursorKey, cursor);
    } catch (err) {
      logger.error('ContractWatcher failed to save cursor', { error: err });
    }
  }
}
