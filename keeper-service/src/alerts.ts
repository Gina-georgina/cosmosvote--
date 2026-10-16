/**
 * Alert notification handlers
 */
import axios from 'axios';
import { AlertConfig, FinalizationReport } from './types';

export class AlertService {
  constructor(private config: AlertConfig) {}

  async sendAlert(report: FinalizationReport): Promise<void> {
    if (report.failures.length === 0) {
      return; // Only alert on failures
    }

    const message = this.formatAlertMessage(report);

    const promises: Promise<void>[] = [];

    if (this.config.slackWebhookUrl) {
      promises.push(this.sendSlackAlert(message));
    }

    if (this.config.discordWebhookUrl) {
      promises.push(this.sendDiscordAlert(message));
    }

    await Promise.allSettled(promises);
  }

  private formatAlertMessage(report: FinalizationReport): string {
    const { timestamp, totalChecked, totalFinalized, failures } = report;
    
    let message = `🔴 Keeper Service Alert\n\n`;
    message += `Timestamp: ${timestamp.toISOString()}\n`;
    message += `Total proposals checked: ${totalChecked}\n`;
    message += `Successfully finalized: ${totalFinalized}\n`;
    message += `Failed: ${failures.length}\n\n`;

    if (failures.length > 0) {
      message += `Failed proposals:\n`;
      failures.forEach(f => {
        message += `- Proposal #${f.proposalId}: ${f.error}\n`;
      });
    }

    return message;
  }

  private async sendSlackAlert(message: string): Promise<void> {
    if (!this.config.slackWebhookUrl) return;

    try {
      await axios.post(this.config.slackWebhookUrl, {
        text: message,
      });
      console.log('Slack alert sent');
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  private async sendDiscordAlert(message: string): Promise<void> {
    if (!this.config.discordWebhookUrl) return;

    try {
      await axios.post(this.config.discordWebhookUrl, {
        content: message,
      });
      console.log('Discord alert sent');
    } catch (error) {
      console.error('Failed to send Discord alert:', error);
    }
  }
}
