import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  conversations,
  agentPool,
} from "@crm-agent/shared/db/schema";

export interface ActiveRun {
  sessionKey: string;
  conversationId: string;
  agentId: string;
  channel: string;
  startedAt: Date;
}

/**
 * Check if there is already an active run for the given session.
 */
export async function hasActiveRun(sessionKey: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.sessionKey, sessionKey),
        eq(conversations.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Start a new active run — inserts a conversation row with status='active'.
 */
export async function startRun(params: {
  sessionKey: string;
  agentId: string;
  channel: string;
  workspaceId?: string;
}): Promise<ActiveRun> {
  const db = getDb();
  const [row] = await db
    .insert(conversations)
    .values({
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      channel: params.channel,
      status: "active",
      workspaceId: params.workspaceId,
    })
    .returning();

  return {
    sessionKey: params.sessionKey,
    conversationId: row.id,
    agentId: params.agentId,
    channel: params.channel,
    startedAt: row.createdAt!,
  };
}

/**
 * End an active run — set status to 'ended' and timestamp.
 */
export async function endRun(sessionKey: string): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ status: "ended", endedAt: new Date() })
    .where(
      and(
        eq(conversations.sessionKey, sessionKey),
        eq(conversations.status, "active"),
      ),
    );
}

/**
 * List all currently active runs (for the /api/chat/active endpoint).
 */
export async function listActiveRuns(): Promise<ActiveRun[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.status, "active"));

  return rows.map((r) => ({
    sessionKey: r.sessionKey,
    conversationId: r.id,
    agentId: r.agentId ?? "",
    channel: r.channel,
    startedAt: r.createdAt!,
  }));
}

/**
 * Allocate an idle agent from the pool. Sets the agent status to 'busy'.
 * Returns the agent ID, or null if none available.
 */
export async function allocateAgent(
  sessionId: string,
  workspaceId?: string,
): Promise<string | null> {
  const db = getDb();

  // Find an idle agent in the workspace
  const [agent] = await db
    .select()
    .from(agentPool)
    .where(eq(agentPool.status, "idle"))
    .limit(1);

  if (!agent) return null;

  await db
    .update(agentPool)
    .set({ status: "busy", lastActiveAt: new Date() })
    .where(eq(agentPool.id, agent.id));

  return agent.id;
}

/**
 * Release an agent back to idle.
 */
export async function releaseAgent(agentId: string): Promise<void> {
  const db = getDb();
  await db
    .update(agentPool)
    .set({ status: "idle", currentSession: null, lastActiveAt: new Date() })
    .where(eq(agentPool.id, agentId));
}
