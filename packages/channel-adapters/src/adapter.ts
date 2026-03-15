/**
 * Base channel adapter interface.
 * Each communication channel (Slack, Teams, email, etc.) implements this.
 */

export interface ChannelConfig {
  channelId: string;
  type: string;
  credentials: Record<string, string>;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InboundMessage {
  /** Unique ID of the inbound message from the channel */
  externalId: string;
  /** Channel-specific conversation/thread identifier */
  threadId: string;
  /** The sender's identifier within the channel */
  senderId: string;
  /** Display name of the sender */
  senderName?: string;
  /** The message text content */
  text: string;
  /** Any attachments or files */
  attachments?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  /** Raw channel-specific payload */
  raw?: unknown;
  /** When the message was sent */
  timestamp: Date;
}

export interface OutboundMessage {
  /** Destination thread/conversation ID */
  threadId: string;
  /** Text content to send */
  text: string;
  /** Optional rich blocks (channel-specific formatting) */
  blocks?: unknown[];
  /** Optional attachments */
  attachments?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
}

export type MessageHandler = (msg: InboundMessage) => Promise<void>;

export interface ChannelAdapter {
  /** The channel type identifier */
  readonly channelType: string;

  /** Initialize the adapter with configuration */
  initialize(config: ChannelConfig): Promise<void>;

  /** Register a handler for incoming messages */
  onMessage(handler: MessageHandler): void;

  /** Send a message to a conversation */
  sendMessage(threadId: string, content: string, options?: Partial<OutboundMessage>): Promise<void>;

  /** Send a typing indicator to a conversation */
  sendTypingIndicator(threadId: string): Promise<void>;

  /** Gracefully shut down the adapter */
  shutdown(): Promise<void>;
}
