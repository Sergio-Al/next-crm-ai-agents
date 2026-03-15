import { getDb } from "@/lib/db";
import { sql, eq, desc, count } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

const DEFAULT_WORKSPACE_ID_QUERY = sql`(SELECT id FROM workspaces LIMIT 1)`;

async function getWorkspaceId() {
  const db = getDb();
  const row = await db.query.workspaces.findFirst();
  return row?.id;
}

export async function createConversation() {
  const db = getDb();
  const workspaceId = await getWorkspaceId();

  const [conv] = await db
    .insert(schema.conversations)
    .values({
      channel: "webchat",
      sessionKey: crypto.randomUUID(),
      status: "active",
      workspaceId: workspaceId ?? null,
    })
    .returning();

  return conv;
}

export async function loadConversationMessages(conversationId: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content,
      parts: schema.messages.parts,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.seq);

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content ?? "",
    ...(r.parts ? { parts: r.parts } : {}),
  }));
}

export async function saveMessage(
  conversationId: string,
  role: string,
  content: string,
  extra?: {
    parts?: unknown;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
  },
) {
  const db = getDb();

  // Get next seq for this conversation
  const [{ maxSeq }] = await db
    .select({ maxSeq: sql<number>`coalesce(max(${schema.messages.seq}), 0)` })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId));

  await db.insert(schema.messages).values({
    conversationId,
    role,
    content,
    parts: extra?.parts ?? null,
    seq: (maxSeq ?? 0) + 1,
    model: extra?.model,
    tokensIn: Number.isFinite(extra?.tokensIn) ? extra!.tokensIn : null,
    tokensOut: Number.isFinite(extra?.tokensOut) ? extra!.tokensOut : null,
  });
}

export async function listConversations() {
  const db = getDb();

  const convos = await db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      createdAt: schema.conversations.createdAt,
      updatedAt: schema.conversations.updatedAt,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.channel, "webchat"))
    .orderBy(desc(schema.conversations.updatedAt));

  // Get first message + message count for each conversation
  const result = await Promise.all(
    convos.map(async (c) => {
      const [countResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, c.id));

      let preview = "";
      if (!c.title) {
        const firstMsg = await db
          .select({ content: schema.messages.content })
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, c.id))
          .orderBy(schema.messages.seq)
          .limit(1);
        preview = firstMsg[0]?.content?.slice(0, 80) ?? "";
      }

      return {
        id: c.id,
        title: c.title ?? preview ?? "New Chat",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: countResult?.total ?? 0,
      };
    }),
  );

  return result.filter((c) => c.messageCount > 0);
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
) {
  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
}

export async function touchConversation(conversationId: string) {
  const db = getDb();
  await db
    .update(schema.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
}
