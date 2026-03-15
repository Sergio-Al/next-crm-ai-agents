import type {
  ChannelAdapter,
  ChannelConfig,
  MessageHandler,
  OutboundMessage,
} from "./adapter.js";

/**
 * Microsoft Teams adapter — integrates with Bot Framework / Graph API.
 *
 * Required credentials in config:
 *   - appId: Azure Bot registration App ID
 *   - appPassword: Azure Bot registration password
 *   - tenantId: Azure AD tenant (optional, for single-tenant)
 */
export class TeamsAdapter implements ChannelAdapter {
  readonly channelType = "teams";

  private config: ChannelConfig | null = null;
  private handlers: MessageHandler[] = [];

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    // TODO: Initialize Bot Framework adapter (botbuilder)
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(
    threadId: string,
    content: string,
    _options?: Partial<OutboundMessage>,
  ): Promise<void> {
    if (!this.config) throw new Error("TeamsAdapter not initialized");
    // TODO: Use Bot Framework to send proactive message
    // await botAdapter.continueConversation(reference, async (context) => {
    //   await context.sendActivity(content);
    // });
    console.log(`[Teams] → ${threadId}: ${content}`);
  }

  async sendTypingIndicator(threadId: string): Promise<void> {
    // TODO: Send typing activity via Bot Framework
    console.log(`[Teams] typing → ${threadId}`);
  }

  async shutdown(): Promise<void> {
    this.config = null;
  }
}
