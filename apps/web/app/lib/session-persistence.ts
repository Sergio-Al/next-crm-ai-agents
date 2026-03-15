import { getDb } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export interface SessionStep {
  type: "crm_action" | "notify" | "wait" | "ai_reason" | "human_checkpoint";
  description: string;
  config?: Record<string, unknown>;
}

export async function createSession(data: {
  goal: string;
  plan: SessionStep[];
  workspaceId?: string | null;
  conversationId?: string | null;
}) {
  const db = getDb();
  const [session] = await db
    .insert(schema.agentSessions)
    .values({
      goal: data.goal,
      plan: data.plan,
      workspaceId: data.workspaceId ?? null,
      conversationId: data.conversationId ?? null,
      status: "running",
      context: {},
      currentStepIndex: 0,
    })
    .returning();
  return session;
}

export async function getSession(id: string) {
  const db = getDb();
  const session = await db.query.agentSessions.findFirst({
    where: eq(schema.agentSessions.id, id),
  });
  if (!session) return null;

  const events = await db
    .select()
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, id))
    .orderBy(schema.sessionEvents.createdAt);

  return { ...session, events };
}

export async function listSessions() {
  const db = getDb();
  return db
    .select()
    .from(schema.agentSessions)
    .orderBy(desc(schema.agentSessions.createdAt))
    .limit(50);
}

export async function updateSessionStatus(
  id: string,
  status: string,
  extra?: { currentStepIndex?: number; context?: Record<string, unknown>; nextRunAt?: Date | null },
) {
  const db = getDb();
  await db
    .update(schema.agentSessions)
    .set({
      status,
      updatedAt: new Date(),
      ...(extra?.currentStepIndex !== undefined
        ? { currentStepIndex: extra.currentStepIndex }
        : {}),
      ...(extra?.context !== undefined ? { context: extra.context } : {}),
      ...(extra?.nextRunAt !== undefined
        ? { nextRunAt: extra.nextRunAt }
        : {}),
    })
    .where(eq(schema.agentSessions.id, id));
}

export async function addSessionEvent(data: {
  sessionId: string;
  stepIndex?: number;
  type: string;
  data?: Record<string, unknown>;
}) {
  const db = getDb();
  const [event] = await db
    .insert(schema.sessionEvents)
    .values({
      sessionId: data.sessionId,
      stepIndex: data.stepIndex ?? null,
      type: data.type,
      data: data.data ?? {},
    })
    .returning();
  return event;
}

export async function resolveHumanCheckpoint(
  sessionId: string,
  approved: boolean,
) {
  const db = getDb();
  const session = await db.query.agentSessions.findFirst({
    where: eq(schema.agentSessions.id, sessionId),
  });
  if (!session || session.status !== "waiting_human") return null;

  await addSessionEvent({
    sessionId,
    stepIndex: session.currentStepIndex,
    type: "human_checkpoint_resolved",
    data: { approved },
  });

  if (approved) {
    // Move to next step
    await updateSessionStatus(sessionId, "running", {
      currentStepIndex: session.currentStepIndex + 1,
    });
  } else {
    await updateSessionStatus(sessionId, "cancelled");
  }

  return { approved, nextStepIndex: approved ? session.currentStepIndex + 1 : null };
}
