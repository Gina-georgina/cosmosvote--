/**
 * Notification service — polls Horizon/Soroban RPC for contract events
 * and delivers them to configured webhooks.
 */

import axios from 'axios';
import { captureError } from './errorTracking';
import { logger } from './logger';

const MAX_POLL_FAILURES = 3;

export interface WebhookPayload {
  contractId: string;
  event: string;
  ledger: number;
  data: unknown;
}

export interface NotificationServiceConfig {
  rpcUrl: string;
  contractId: string;
  webhookUrl: string;
  pollIntervalMs?: number;
}

export class NotificationService {
  private consecutiveFailures = 0;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: NotificationServiceConfig) {}

  async pollEvents(): Promise<WebhookPayload[]> {
    try {
      const response = await axios.post<{ events: WebhookPayload[] }>(
        `${this.config.rpcUrl}/getEvents`,
        { contractIds: [this.config.contractId] },
        { timeout: 10_000 }
      );
      this.consecutiveFailures = 0;
      return response.data.events ?? [];
    } catch (err) {
      this.consecutiveFailures += 1;
      const alertThresholdReached = this.consecutiveFailures >= MAX_POLL_FAILURES;
      captureError(err, {
        context: 'event-polling',
        contractId: this.config.contractId,
        consecutiveFailures: this.consecutiveFailures,
        alertThresholdReached,
      });
      if (alertThresholdReached) {
        logger.error(
          {
            event: 'poll_failure_threshold',
            consecutiveFailures: this.consecutiveFailures,
            contractId: this.config.contractId,
          },
          `${this.consecutiveFailures} consecutive poll failures — alert sent`
        );
      } else {
        logger.warn(
          {
            event: 'poll_failure',
            consecutiveFailures: this.consecutiveFailures,
            contractId: this.config.contractId,
            err,
          },
          'event poll failed'
        );
      }
      return [];
    }
  }

  async deliverWebhook(payload: WebhookPayload): Promise<void> {
    try {
      await axios.post(this.config.webhookUrl, payload, { timeout: 5_000 });
      logger.debug(
        { event: 'webhook_delivered', contractEvent: payload.event, ledger: payload.ledger },
        'webhook delivered'
      );
    } catch (err) {
      captureError(err, {
        context: 'webhook-delivery',
        // webhookUrl is redacted by the pino redact config
        webhookUrl: this.config.webhookUrl,
        event: payload.event,
      });
      logger.error(
        {
          event: 'webhook_delivery_failed',
          contractEvent: payload.event,
          ledger: payload.ledger,
          err,
        },
        'webhook delivery failed'
      );
    }
  }

  async runOnce(): Promise<void> {
    const events = await this.pollEvents();
    logger.debug({ event: 'poll_cycle', eventCount: events.length }, 'poll cycle complete');
    for (const event of events) {
      await this.deliverWebhook(event);
    }
  }

  start(): void {
    this.running = true;
    logger.info({ event: 'service_start' }, 'notification service loop started');
    const tick = async () => {
      if (!this.running) return;
      await this.runOnce();
      this.timer = setTimeout(tick, this.config.pollIntervalMs ?? 6_000);
    };
    void tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    logger.info({ event: 'service_stop' }, 'notification service loop stopped');
  }
}
