/**
 * Alerting Service
 *
 * Configurable alerting system for error monitoring during the Metabolic-Tracker pilot.
 * Supports multiple notification channels: Slack, email, SMS (via Twilio), and webhooks.
 *
 * IMPORTANT: Alerts never contain PHI - only error categories, counts, and system context.
 */

import { ErrorSeverity } from "./errorMonitoring";

// Re-export ErrorSeverity for convenience
export { ErrorSeverity };

// ============================================================================
// ALERTING CONFIGURATION
// ============================================================================

export interface AlertConfig {
  /** Minimum severity level that triggers an alert */
  minSeverity: ErrorSeverity;
  /** Channels to notify for this severity */
  channels: AlertChannel[];
  /** Cooldown period in minutes before re-alerting for same error */
  cooldownMinutes: number;
  /** Maximum alerts per hour for this severity (rate limiting) */
  maxAlertsPerHour: number;
}

export type AlertChannel = "slack" | "email" | "sms" | "webhook" | "console";

export interface AlertMessage {
  severity: ErrorSeverity;
  title: string;
  description: string;
  category: string;
  count?: number;
  requestId?: string;
  environment: string;
  timestamp: Date;
  /** Link to Sentry or monitoring dashboard */
  dashboardUrl?: string;
}

// Default alerting configuration by severity
const DEFAULT_ALERT_CONFIG: Record<ErrorSeverity, AlertConfig> = {
  [ErrorSeverity.CRITICAL]: {
    minSeverity: ErrorSeverity.CRITICAL,
    channels: ["slack", "sms", "email"],
    cooldownMinutes: 5,
    maxAlertsPerHour: 20,
  },
  [ErrorSeverity.HIGH]: {
    minSeverity: ErrorSeverity.HIGH,
    channels: ["slack", "email"],
    cooldownMinutes: 15,
    maxAlertsPerHour: 30,
  },
  [ErrorSeverity.MEDIUM]: {
    minSeverity: ErrorSeverity.MEDIUM,
    channels: ["slack"],
    cooldownMinutes: 60,
    maxAlertsPerHour: 10,
  },
  [ErrorSeverity.LOW]: {
    minSeverity: ErrorSeverity.LOW,
    channels: ["console"],
    cooldownMinutes: 120,
    maxAlertsPerHour: 5,
  },
};

// ============================================================================
// ALERT RULES
// ============================================================================

export interface AlertRule {
  name: string;
  description: string;
  /** Condition function that returns true if alert should fire */
  condition: (metrics: AlertMetrics) => boolean;
  severity: ErrorSeverity;
  channels: AlertChannel[];
  /** How often this rule is evaluated (minutes) */
  evaluationIntervalMinutes: number;
}

export interface AlertMetrics {
  errorCountLast5Min: number;
  errorCountLast1Hour: number;
  errorRatePerMinute: number;
  baselineErrorRatePerMinute: number;
  criticalErrorCount: number;
  highErrorCount: number;
  newErrorTypes: string[];
  affectedUsers: number;
}

// Predefined alert rules for pilot
const ALERT_RULES: AlertRule[] = [
  {
    name: "critical_error_immediate",
    description: "Any CRITICAL error triggers immediate alert",
    condition: (metrics) => metrics.criticalErrorCount > 0,
    severity: ErrorSeverity.CRITICAL,
    channels: ["slack", "sms", "email"],
    evaluationIntervalMinutes: 1,
  },
  {
    name: "high_error_spike",
    description: "More than 10 HIGH errors in 5 minutes",
    condition: (metrics) => metrics.highErrorCount >= 10,
    severity: ErrorSeverity.HIGH,
    channels: ["slack", "email"],
    evaluationIntervalMinutes: 5,
  },
  {
    name: "error_rate_spike",
    description: "Error rate 3x normal baseline",
    condition: (metrics) =>
      metrics.baselineErrorRatePerMinute > 0 &&
      metrics.errorRatePerMinute > metrics.baselineErrorRatePerMinute * 3,
    severity: ErrorSeverity.HIGH,
    channels: ["slack", "email"],
    evaluationIntervalMinutes: 5,
  },
  {
    name: "new_error_type",
    description: "New error type never seen before",
    condition: (metrics) => metrics.newErrorTypes.length > 0,
    severity: ErrorSeverity.MEDIUM,
    channels: ["slack"],
    evaluationIntervalMinutes: 15,
  },
  {
    name: "user_impact_high",
    description: "More than 10% of active users affected by errors",
    condition: (metrics) => metrics.affectedUsers >= 10, // Adjust based on pilot size
    severity: ErrorSeverity.HIGH,
    channels: ["slack", "email"],
    evaluationIntervalMinutes: 15,
  },
];

// ============================================================================
// ALERTING SERVICE
// ============================================================================

class AlertingService {
  private alertHistory: Map<string, Date> = new Map();
  private alertCounts: Map<string, number[]> = new Map();
  private config: Record<ErrorSeverity, AlertConfig>;
  private rules: AlertRule[];

  constructor(
    config: Record<ErrorSeverity, AlertConfig> = DEFAULT_ALERT_CONFIG,
    rules: AlertRule[] = ALERT_RULES
  ) {
    this.config = config;
    this.rules = rules;
  }

  /**
   * Send an alert through configured channels
   */
  async sendAlert(message: AlertMessage): Promise<void> {
    const config = this.config[message.severity];
    const alertKey = `${message.severity}:${message.category}`;

    // Check rate limiting
    if (!this.shouldAlert(alertKey, config)) {
      console.log(`[Alerting] Rate limited: ${alertKey}`);
      return;
    }

    // Record this alert
    this.recordAlert(alertKey);

    // Send to all configured channels
    const results = await Promise.allSettled(
      config.channels.map((channel) => this.sendToChannel(channel, message))
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`[Alerting] Failed to send to ${config.channels[index]}:`, result.reason);
      }
    });
  }

  /**
   * Evaluate all alert rules against current metrics
   */
  async evaluateRules(metrics: AlertMetrics): Promise<void> {
    for (const rule of this.rules) {
      try {
        if (rule.condition(metrics)) {
          const message: AlertMessage = {
            severity: rule.severity,
            title: rule.name,
            description: rule.description,
            category: "rule_triggered",
            environment: process.env.NODE_ENV || "development",
            timestamp: new Date(),
            dashboardUrl: process.env.SENTRY_DASHBOARD_URL,
          };

          await this.sendAlert(message);
        }
      } catch (error) {
        console.error(`[Alerting] Error evaluating rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Check if we should send an alert (rate limiting and cooldown)
   */
  private shouldAlert(alertKey: string, config: AlertConfig): boolean {
    const now = new Date();

    // Check cooldown
    const lastAlert = this.alertHistory.get(alertKey);
    if (lastAlert) {
      const cooldownMs = config.cooldownMinutes * 60 * 1000;
      if (now.getTime() - lastAlert.getTime() < cooldownMs) {
        return false;
      }
    }

    // Check rate limit
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    const recentAlerts = this.alertCounts.get(alertKey) || [];
    const alertsLastHour = recentAlerts.filter((time) => time > hourAgo).length;

    if (alertsLastHour >= config.maxAlertsPerHour) {
      return false;
    }

    return true;
  }

  /**
   * Record that an alert was sent
   */
  private recordAlert(alertKey: string): void {
    const now = new Date();
    this.alertHistory.set(alertKey, now);

    const counts = this.alertCounts.get(alertKey) || [];
    counts.push(now.getTime());

    // Clean up old entries (keep only last hour)
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    const recentCounts = counts.filter((time) => time > hourAgo);
    this.alertCounts.set(alertKey, recentCounts);
  }

  /**
   * Send alert to a specific channel
   */
  private async sendToChannel(channel: AlertChannel, message: AlertMessage): Promise<void> {
    switch (channel) {
      case "slack":
        await this.sendSlackAlert(message);
        break;
      case "email":
        await this.sendEmailAlert(message);
        break;
      case "sms":
        await this.sendSmsAlert(message);
        break;
      case "webhook":
        await this.sendWebhookAlert(message);
        break;
      case "console":
        this.sendConsoleAlert(message);
        break;
    }
  }

  /**
   * Send Slack alert via webhook
   */
  private async sendSlackAlert(message: AlertMessage): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[Alerting] SLACK_WEBHOOK_URL not configured");
      return;
    }

    const color = this.getSeverityColor(message.severity);
    const emoji = this.getSeverityEmoji(message.severity);

    const payload = {
      attachments: [
        {
          color,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${emoji} ${message.severity.toUpperCase()}: ${message.title}`,
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: message.description,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `*Environment:* ${message.environment}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Category:* ${message.category}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Time:* ${message.timestamp.toISOString()}`,
                },
              ],
            },
            ...(message.dashboardUrl
              ? [
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "View in Dashboard",
                          emoji: true,
                        },
                        url: message.dashboardUrl,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  }

  /**
   * Send email alert (placeholder - implement with your email service)
   */
  private async sendEmailAlert(message: AlertMessage): Promise<void> {
    const recipients = process.env.ALERT_EMAIL_RECIPIENTS?.split(",") || [];
    if (recipients.length === 0) {
      console.warn("[Alerting] ALERT_EMAIL_RECIPIENTS not configured");
      return;
    }

    // TODO: Implement with your email service (SendGrid, SES, etc.)
    // For now, log the email that would be sent
    console.log(`[Alerting] Would send email to ${recipients.join(", ")}:`, {
      subject: `[${message.severity.toUpperCase()}] ${message.title}`,
      body: message.description,
    });

    // Example SendGrid implementation:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({
    //   to: recipients,
    //   from: 'alerts@metabolic-tracker.com',
    //   subject: `[${message.severity.toUpperCase()}] ${message.title}`,
    //   text: message.description,
    //   html: this.formatEmailHtml(message),
    // });
  }

  /**
   * Send SMS alert via Twilio (placeholder)
   */
  private async sendSmsAlert(message: AlertMessage): Promise<void> {
    const phoneNumbers = process.env.ALERT_SMS_NUMBERS?.split(",") || [];
    if (phoneNumbers.length === 0) {
      console.warn("[Alerting] ALERT_SMS_NUMBERS not configured");
      return;
    }

    // TODO: Implement with Twilio
    // For now, log the SMS that would be sent
    console.log(`[Alerting] Would send SMS to ${phoneNumbers.join(", ")}:`, {
      body: `[${message.severity.toUpperCase()}] ${message.title}: ${message.description}`,
    });

    // Example Twilio implementation:
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // for (const phone of phoneNumbers) {
    //   await client.messages.create({
    //     body: `[${message.severity.toUpperCase()}] ${message.title}: ${message.description}`,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: phone,
    //   });
    // }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(message: AlertMessage): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[Alerting] ALERT_WEBHOOK_URL not configured");
      return;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  }

  /**
   * Send console alert (for development)
   */
  private sendConsoleAlert(message: AlertMessage): void {
    const emoji = this.getSeverityEmoji(message.severity);
    console.log(`\n${emoji} [ALERT] ${message.severity.toUpperCase()}: ${message.title}`);
    console.log(`   ${message.description}`);
    console.log(`   Category: ${message.category} | Environment: ${message.environment}`);
    console.log(`   Time: ${message.timestamp.toISOString()}\n`);
  }

  /**
   * Get color for severity level (Slack attachment color)
   */
  private getSeverityColor(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return "#dc2626"; // red-600
      case ErrorSeverity.HIGH:
        return "#ea580c"; // orange-600
      case ErrorSeverity.MEDIUM:
        return "#ca8a04"; // yellow-600
      case ErrorSeverity.LOW:
        return "#2563eb"; // blue-600
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return "🚨";
      case ErrorSeverity.HIGH:
        return "⚠️";
      case ErrorSeverity.MEDIUM:
        return "📢";
      case ErrorSeverity.LOW:
        return "ℹ️";
    }
  }
}

// Export singleton instance
export const alertingService = new AlertingService();

// Export for custom configuration
export { AlertingService, DEFAULT_ALERT_CONFIG, ALERT_RULES };
