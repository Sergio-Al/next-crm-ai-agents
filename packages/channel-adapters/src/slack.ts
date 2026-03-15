import type {
  ChannelAdapter,
  ChannelConfig,
  MessageHandler,
  OutboundMessage,
} from "./adapter.js";

/**
 * Slack adapter — integrates with Slack's Events API and Web API.
 *
 * Required credentials in config:
 *   - botToken: xoxb-... Bot User OAuth Token
 *   - signingSecret: Slack signing secret for request verification
 *   - appToken: xapp-... (optional, for Socket Mode)
 */
export class SlackAdapter implements ChannelAdapter {
  readonly channelType = "slack";

  private config: ChannelConfig | null = null;
  private handlers: MessageHandler[] = [];

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    // TODO: Initialize Slack Web API client (@slack/web-api)
    // TODO: Set up Slack Events API listener or Socket Mode
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(
    threadId: string,
    content: string,
    options?: Partial<OutboundMessage>,
  ): Promise<void> {
    if (!this.config) throw new Error("SlackAdapter not initialized");
    // TODO: Use Slack Web API chat.postMessage
    // await slackClient.chat.postMessage({
    //   channel: threadId,
    //   text: content,
    //   blocks: options?.blocks,
    //   thread_ts: options?.threadId,
    // });
    console.log(`[Slack] → ${threadId}: ${content}`);
  }

  async sendTypingIndicator(_threadId: string): Promise<void> {
    // Slack doesn't have a direct typing indicator API for bots
  }

  async shutdown(): Promise<void> {
    // TODO: Disconnect Socket Mode or stop Events API listener
    this.config = null;
  }
}
