/**
 * Notification service — polls Horizon/Soroban RPC for contract events
 * and delivers them to configured webhooks.
 */

import axios from 'axios';
import { captureError } from './errorTracking';

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

  async checkReadiness(): Promise<boolean> {
    try {
      const response = await axios.post<{ result?: { status?: string } }>(
        `${this.config.rpcUrl.replace(/\/+$/, '')}/`,
        { jsonrpc: '2.0', id: 1, method: 'getHealth' },
        { timeout: 5_000 }
      );
      return response.data.result?.status === 'healthy';
    } catch {
      return false;
    }
  }

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
      captureError(err, {
        context: 'event-polling',
        contractId: this.config.contractId,
        consecutiveFailures: this.consecutiveFailures,
        alertThresholdReached: this.consecutiveFailures >= MAX_POLL_FAILURES,
      });
      if (this.consecutiveFailures >= MAX_POLL_FAILURES) {
        console.error(
          `[notification] ⚠️  ${this.consecutiveFailures} consecutive poll failures — alert sent`
        );
      }
      return [];
    }
  }

  async deliverWebhook(payload: WebhookPayload): Promise<void> {
    try {
      await axios.post(this.config.webhookUrl, payload, { timeout: 5_000 });
    } catch (err) {
      captureError(err, {
        context: 'webhook-delivery',
        webhookUrl: this.config.webhookUrl,
        event: payload.event,
      });
    }
  }

  async runOnce(): Promise<void> {
    const events = await this.pollEvents();
    for (const event of events) {
      await this.deliverWebhook(event);
    }
  }

  start(): void {
    this.running = true;
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
  }
}
