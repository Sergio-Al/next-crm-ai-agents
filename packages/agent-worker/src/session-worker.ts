import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { generateText } from "ai";
import { createProvider } from "./llm-client.js";
import { createDb } from "@crm-agent/shared/db";
import { eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { parseDuration } from "./utils/parse-duration.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

let _db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!_db) _db = createDb(DATABASE_URL);
  return _db;
}

interface SessionStep {
  type: "crm_action" | "notify" | "wait" | "ai_reason" | "human_checkpoint";
  description: string;
  config?: Record<string, unknown>;
}

async function addEvent(data: {
  sessionId: string;
  stepIndex?: number;
  type: string;
  data?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(schema.sessionEvents).values({
    sessionId: data.sessionId,
    stepIndex: data.stepIndex ?? null,
    type: data.type,
    data: data.data ?? {},
  });
}

async function updateSession(
  id: string,
  values: {
    status?: string;
    currentStepIndex?: number;
    context?: Record<string, unknown>;
    nextRunAt?: Date | null;
  },
) {
  const db = getDb();
  await db
    .update(schema.agentSessions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.agentSessions.id, id));
}

async function enqueueNextStep(
  queue: Queue,
  sessionId: string,
  stepIndex: number,
  delay?: number,
) {
  await queue.add(
    `session-step:${sessionId}:${stepIndex}`,
    { sessionId, stepIndex },
    { delay: delay ?? undefined, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
  );
}

export function startSessionWorker() {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = new Queue("session-steps", {
    connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) as any,
  });

  const worker = new Worker(
    "session-steps",
    async (job) => {
      const { sessionId, stepIndex } = job.data as {
        sessionId: string;
        stepIndex: number;
      };

      const db = getDb();
      const session = await db.query.agentSessions.findFirst({
        where: eq(schema.agentSessions.id, sessionId),
      });

      if (!session) {
        console.error(`[SessionWorker] Session ${sessionId} not found`);
        return;
      }

      // Skip if cancelled/completed/paused
      if (["cancelled", "completed", "failed", "paused"].includes(session.status)) {
        console.log(`[SessionWorker] Session ${sessionId} is ${session.status}, skipping step ${stepIndex}`);
        return;
      }

      const plan = session.plan as SessionStep[];
      if (stepIndex >= plan.length) {
        // All steps done
        await updateSession(sessionId, { status: "completed" });
        await addEvent({ sessionId, type: "session_completed" });
        console.log(`[SessionWorker] Session ${sessionId} completed`);
        return;
      }

      const step = plan[stepIndex];
      const ctx = (session.context ?? {}) as Record<string, unknown>;

      await addEvent({
        sessionId,
        stepIndex,
        type: "step_started",
        data: { stepType: step.type, description: step.description },
      });

      await updateSession(sessionId, { currentStepIndex: stepIndex });

      try {
        switch (step.type) {
          case "crm_action": {
            // Execute CRM action described in config
            const actionType = (step.config?.action as string) ?? "note";
            const result = { action: actionType, description: step.description, executedAt: new Date().toISOString() };

            // If it's a note/activity, insert it
            if (actionType === "create_activity" || actionType === "note") {
              const workspaceId = session.workspaceId;
              if (workspaceId) {
                await db.insert(schema.activities).values({
                  workspaceId,
                  type: "note",
                  subject: step.description,
                  body: JSON.stringify(step.config),
                  contactId: (step.config?.contactId as string) ?? null,
                  dealId: (step.config?.dealId as string) ?? null,
                  metadata: { sessionId, stepIndex },
                });
              }
            }

            ctx[`step_${stepIndex}_result`] = result;
            await addEvent({
              sessionId,
              stepIndex,
              type: "crm_action_result",
              data: result,
            });
            await updateSession(sessionId, { context: ctx });
            await enqueueNextStep(queue, sessionId, stepIndex + 1);
            break;
          }

          case "notify": {
            const workspaceId = session.workspaceId;
            if (workspaceId) {
              // Get first workspace member as notification target
              const member = await db.query.workspaceMembers.findFirst({
                where: eq(schema.workspaceMembers.workspaceId, workspaceId),
              });
              if (member) {
                await db.insert(schema.notifications).values({
                  workspaceId,
                  userId: member.userId,
                  type: "session_notification",
                  title: step.description,
                  body: `Session: ${session.goal}`,
                  metadata: { sessionId, stepIndex },
                });
              }
            }
            await addEvent({
              sessionId,
              stepIndex,
              type: "step_completed",
              data: { stepType: "notify" },
            });
            await enqueueNextStep(queue, sessionId, stepIndex + 1);
            break;
          }

          case "wait": {
            const durationStr = (step.config?.duration as string) ?? "1d";
            const delayMs = parseDuration(durationStr);
            if (!delayMs) {
              throw new Error(`Invalid duration: ${durationStr}`);
            }

            const nextRunAt = new Date(Date.now() + delayMs);
            await updateSession(sessionId, { nextRunAt });
            await addEvent({
              sessionId,
              stepIndex,
              type: "wait_scheduled",
              data: { duration: durationStr, delayMs, nextRunAt: nextRunAt.toISOString() },
            });
            // Enqueue the next step with the delay
            await enqueueNextStep(queue, sessionId, stepIndex + 1, delayMs);
            break;
          }

          case "ai_reason": {
            const model = process.env.DEFAULT_MODEL ?? "openai/gpt-4o";
            const { text } = await generateText({
              model: createProvider(model),
              system: `You are an AI assistant executing a multi-step plan. The overall goal is: "${session.goal}". You are at step ${stepIndex + 1} of ${plan.length}. The step instruction is: "${step.description}". Based on the accumulated context, decide what to do next and provide your reasoning and any output.`,
              prompt: `Accumulated context so far:\n${JSON.stringify(ctx, null, 2)}\n\nProvide your reasoning and output for this step.`,
              maxTokens: 1024,
            });

            ctx[`step_${stepIndex}_reasoning`] = text;
            await addEvent({
              sessionId,
              stepIndex,
              type: "ai_reasoning",
              data: { reasoning: text },
            });
            await updateSession(sessionId, { context: ctx });
            await enqueueNextStep(queue, sessionId, stepIndex + 1);
            break;
          }

          case "human_checkpoint": {
            await updateSession(sessionId, { status: "waiting_human" });
            await addEvent({
              sessionId,
              stepIndex,
              type: "human_checkpoint_requested",
              data: { description: step.description },
            });
            // Stop here — user must resolve via API
            const workspaceId = session.workspaceId;
            if (workspaceId) {
              const member = await db.query.workspaceMembers.findFirst({
                where: eq(schema.workspaceMembers.workspaceId, workspaceId),
              });
              if (member) {
                await db.insert(schema.notifications).values({
                  workspaceId,
                  userId: member.userId,
                  type: "human_checkpoint",
                  title: `Approval needed: ${step.description}`,
                  body: `Session "${session.goal}" requires your input.`,
                  link: `/sessions/${sessionId}`,
                  metadata: { sessionId, stepIndex },
                });
              }
            }
            break;
          }
        }

        // Mark step completed (except for wait & checkpoint which handle flow differently)
        if (step.type !== "wait" && step.type !== "human_checkpoint") {
          await addEvent({
            sessionId,
            stepIndex,
            type: "step_completed",
            data: { stepType: step.type },
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[SessionWorker] Step ${stepIndex} failed for session ${sessionId}:`, errorMessage);
        await addEvent({
          sessionId,
          stepIndex,
          type: "step_failed",
          data: { error: errorMessage },
        });
        await updateSession(sessionId, { status: "failed" });
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: connection as any,
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[SessionWorker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[SessionWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log("[SessionWorker] Session step worker started");

  return worker;
}
