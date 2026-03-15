import { getRedis } from "./redis";
import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _queue: Queue | undefined;

function getQueue() {
  if (!_queue) {
    const redis = getRedis();
    _queue = new Queue("agent-jobs", { connection: redis as any });
  }
  return _queue;
}

/**
 * Enqueue an agent job via BullMQ queue (consumed by agent-worker).
 */
export async function enqueueAgentJob(params: {
  sessionKey: string;
  message: string;
  model?: string;
  workspaceId?: string;
}): Promise<void> {
  const queue = getQueue();
  await queue.add("agent-job", {
    sessionKey: params.sessionKey,
    message: params.message,
    ...(params.model ? { model: params.model } : {}),
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
  });
}

/**
 * Create a ReadableStream that subscribes to a session's Redis event stream.
 * Emits SSE-formatted events until the session finishes or is aborted.
 */
export function createSSEStream(sessionKey: string, signal?: AbortSignal): ReadableStream {
  const redis = getRedis().duplicate();
  const streamKey = `stream:events:${sessionKey}`;
  let lastId = "0";
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      signal?.addEventListener("abort", () => {
        cancelled = true;
        redis.disconnect();
      });

      while (!cancelled) {
        try {
          const results = await redis.xread(
            "COUNT",
            100,
            "BLOCK",
            5000,
            "STREAMS",
            streamKey,
            lastId,
          );

          if (!results) continue;

          for (const [, entries] of results) {
            for (const [id, fields] of entries as [string, string[]][]) {
              lastId = id;
              const eventType = fields[fields.indexOf("eventType") + 1];
              const payload = fields[fields.indexOf("payload") + 1];

              const sseData = `event: ${eventType}\ndata: ${payload}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));

              // End stream on finish or error
              if (eventType === "finish" || eventType === "error") {
                cancelled = true;
                break;
              }
            }
          }
        } catch {
          // Connection closed or error — stop
          break;
        }
      }

      redis.disconnect();
      controller.close();
    },
    cancel() {
      cancelled = true;
      redis.disconnect();
    },
  });
}

/**
 * Publish an abort signal for a running session.
 */
export async function abortSession(sessionKey: string): Promise<void> {
  const redis = getRedis();
  await redis.xadd(
    `stream:events:${sessionKey}`,
    "*",
    "sessionKey",
    sessionKey,
    "eventType",
    "abort",
    "payload",
    JSON.stringify({ type: "abort" }),
  );
}
