import type {
  ChannelAdapter,
  ChannelConfig,
  MessageHandler,
  OutboundMessage,
  InboundMessage,
} from "./adapter.js";

/**
 * REST API adapter — enables programmatic access to the agent
 * via standard HTTP requests. Responses are returned synchronously
 * or via webhook callbacks.
 *
 * Config credentials:
 *   - apiKey: API key for authenticating inbound requests
 *   - webhookUrl: (optional) URL to POST agent responses to
 */
export class ApiAdapter implements ChannelAdapter {
  readonly channelType = "api";

  private config: ChannelConfig | null = null;
  private handlers: MessageHandler[] = [];

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Process an inbound API request. Called from an HTTP route handler.
   */
  async processRequest(params: {
    threadId: string;
    senderId: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const msg: InboundMessage = {
      externalId: crypto.randomUUID(),
      threadId: params.threadId,
      senderId: params.senderId,
      text: params.text,
      timestamp: new Date(),
      raw: params.metadata,
    };

    for (const handler of this.handlers) {
      await handler(msg);
    }
  }

  async sendMessage(
    threadId: string,
    content: string,
    _options?: Partial<OutboundMessage>,
  ): Promise<void> {
    if (!this.config) throw new Error("ApiAdapter not initialized");

    const webhookUrl = this.config.webhookUrl;
    if (webhookUrl) {
      // POST response to webhook
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, content, timestamp: new Date().toISOString() }),
      });
    }
  }

  async sendTypingIndicator(_threadId: string): Promise<void> {
    // No-op for API channel
  }

  async shutdown(): Promise<void> {
    this.config = null;
  }
}
