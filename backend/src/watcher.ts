import { Horizon } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { logger } from './logger';
import { db } from './db';

export interface WatcherConfig {
  horizonUrl: string;
  contractId: string;
  pollIntervalMs: number;
  cursorKey: string;
  maxRetries?: number;
}

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER_RATIO = 0.2;
const DEFAULT_MAX_RETRIES = 5;

function resolveMaxRetries(config: WatcherConfig): number {
  const fromConfig = config.maxRetries;
  if (typeof fromConfig === 'number' && Number.isFinite(fromConfig) && fromConfig >= 0) {
    return fromConfig;
  }
  const fromEnv = Number(process.env.WATCHER_MAX_RETRIES);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return fromEnv;
  }
  return DEFAULT_MAX_RETRIES;
}

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
  private attempt = 0;
  private readonly maxRetries: number;

  constructor(private readonly config: WatcherConfig) {
    this.server = new Horizon.Server(config.horizonUrl);
    this.maxRetries = resolveMaxRetries(config);
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('ContractWatcher already running');
      return;
    }
    this.running = true;
    this.attempt = 0;
    this.cursor = await this.loadCursor();
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
    let delayMs = this.config.pollIntervalMs;
    try {
      const events = await this.fetchEvents();
      this.attempt = 0;
      for (const event of events) {
        await this.handleEvent(event);
      }
    } catch (err) {
      this.attempt += 1;
      if (this.attempt > this.maxRetries) {
        logger.error('ContractWatcher exceeded max retries, stopping', {
          error: err,
          attempt: this.attempt,
          maxRetries: this.maxRetries,
        });
        await this.stop();
        return;
      }
      delayMs = this.computeBackoffDelay(this.attempt);
      logger.error('ContractWatcher poll failed, backing off', {
        error: err,
        attempt: this.attempt,
        maxRetries: this.maxRetries,
        delayMs,
      });
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => void this.poll(), delayMs);
      }
    }
  }

  private computeBackoffDelay(attempt: number): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_INITIAL_MS * 2 ** (attempt - 1));
    const jitter = base * BACKOFF_JITTER_RATIO * (Math.random() * 2 - 1);
    return Math.max(0, Math.min(BACKOFF_MAX_MS, Math.round(base + jitter)));
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
      await db.saveContractEvent(event);
      this.cursor = event.pagingToken;
      await this.saveCursor(this.cursor);
    } catch (err) {
      logger.error('ContractWatcher failed to handle event', { error: err, event });
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
