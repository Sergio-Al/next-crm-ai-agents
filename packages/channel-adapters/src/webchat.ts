import type {
  ChannelAdapter,
  ChannelConfig,
  MessageHandler,
  OutboundMessage,
  InboundMessage,
} from "./adapter.js";
import { Redis } from "ioredis";

/**
 * WebChat adapter — uses Redis Streams to bridge browser WebSocket
 * connections with the agent worker pipeline.
 */
export class WebChatAdapter implements ChannelAdapter {
  readonly channelType = "webchat";

  private redis: Redis | null = null;
  private handlers: MessageHandler[] = [];
  private config: ChannelConfig | null = null;

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    const redisUrl = config.credentials.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
    this.redis = new Redis(redisUrl);
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async sendMessage(
    threadId: string,
    content: string,
    _options?: Partial<OutboundMessage>,
  ): Promise<void> {
    if (!this.redis) throw new Error("WebChatAdapter not initialized");

    await this.redis.xadd(
      `stream:events:${threadId}`,
      "*",
      "sessionKey", threadId,
      "eventType", "text-delta",
      "payload", JSON.stringify({ type: "text-delta", delta: content }),
    );
  }

  async sendTypingIndicator(threadId: string): Promise<void> {
    if (!this.redis) throw new Error("WebChatAdapter not initialized");

    await this.redis.xadd(
      `stream:events:${threadId}`,
      "*",
      "sessionKey", threadId,
      "eventType", "typing",
      "payload", JSON.stringify({ type: "typing" }),
    );
  }

  /** Dispatch an inbound message to all registered handlers */
  async dispatchInbound(msg: InboundMessage): Promise<void> {
    for (const handler of this.handlers) {
      await handler(msg);
    }
  }

  async shutdown(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
  }
}
