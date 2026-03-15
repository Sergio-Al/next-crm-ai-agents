import type {
  ChannelAdapter,
  ChannelConfig,
  MessageHandler,
  OutboundMessage,
} from "./adapter.js";

/**
 * Email adapter — sends/receives email via SMTP/IMAP or a transactional
 * email service (SendGrid, Postmark, AWS SES).
 *
 * Required credentials in config:
 *   - smtpHost, smtpPort, smtpUser, smtpPass (for SMTP)
 *   - imapHost, imapPort, imapUser, imapPass (for inbound via IMAP)
 *   - OR apiKey + provider ('sendgrid' | 'postmark' | 'ses')
 *   - fromAddress: The "From" email address
 */
export class EmailAdapter implements ChannelAdapter {
  readonly channelType = "email";

  private config: ChannelConfig | null = null;
  private handlers: MessageHandler[] = [];

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    // TODO: Initialize nodemailer transport or email service SDK
    // TODO: Set up IMAP listener or webhook receiver for inbound emails
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(
    threadId: string,
    content: string,
    _options?: Partial<OutboundMessage>,
  ): Promise<void> {
    if (!this.config) throw new Error("EmailAdapter not initialized");
    // TODO: Send email via SMTP/API
    // The threadId here maps to the email thread (In-Reply-To / References headers)
    console.log(`[Email] → ${threadId}: ${content.substring(0, 100)}...`);
  }

  async sendTypingIndicator(_threadId: string): Promise<void> {
    // Email doesn't support typing indicators
  }

  async shutdown(): Promise<void> {
    // TODO: Close IMAP connection if open
    this.config = null;
  }
}
