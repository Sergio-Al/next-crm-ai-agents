import { eq, asc } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { createDb } from "@crm-agent/shared/db";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

// Lazy-init DB to allow env vars to be set before first use
let _db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!_db) {
    _db = createDb(DATABASE_URL);
  }
  return _db;
}

/**
 * Load conversation history for a session from PostgreSQL.
 * Returns messages in the format expected by the AI SDK.
 */
export async function loadConversationHistory(
  sessionKey: string,
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const db = getDb();

  // Find conversation by session key
  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.sessionKey, sessionKey),
  });

  if (!conversation) return [];

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversation.id),
    orderBy: [asc(schema.messages.seq)],
  });

  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content ?? "",
    }));
}

/**
 * Append a message to the conversation in PostgreSQL.
 */
export async function appendMessage(
  sessionKey: string,
  msg: {
    role: string;
    content: string;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
  },
): Promise<void> {
  const db = getDb();

  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.sessionKey, sessionKey),
  });

  if (!conversation) return;

  // Get next sequence number
  const existing = await db.query.messages.findMany({
    where: eq(schema.messages.conversationId, conversation.id),
    orderBy: [asc(schema.messages.seq)],
  });
  const nextSeq = existing.length > 0 ? existing[existing.length - 1].seq + 1 : 0;

  await db.insert(schema.messages).values({
    conversationId: conversation.id,
    role: msg.role,
    content: msg.content,
    seq: nextSeq,
    model: msg.model,
    tokensIn: msg.tokensIn,
    tokensOut: msg.tokensOut,
  });
}

/**
 * Append a tool call record to the most recent assistant message.
 */
export async function appendToolCall(
  sessionKey: string,
  tc: {
    toolName: string;
    toolCallId: string;
    params: unknown;
    result?: unknown;
    durationMs?: number;
  },
): Promise<void> {
  const db = getDb();

  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.sessionKey, sessionKey),
  });

  if (!conversation) return;

  // Find the most recent assistant message
  const lastMessage = await db.query.messages.findFirst({
    where: eq(schema.messages.conversationId, conversation.id),
    orderBy: [asc(schema.messages.seq)],
  });

  if (!lastMessage) return;

  await db.insert(schema.toolCalls).values({
    messageId: lastMessage.id,
    toolName: tc.toolName,
    toolCallId: tc.toolCallId,
    params: tc.params,
    result: tc.result,
    durationMs: tc.durationMs,
    status: tc.result ? "success" : "pending",
  });
}
