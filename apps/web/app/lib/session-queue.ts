import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";

let _queue: Queue | null = null;

function getQueue() {
  if (!_queue) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _queue = new Queue("session-steps", {
      connection: getRedis() as any,
    });
  }
  return _queue;
}

/**
 * Enqueue a session step for processing by the agent-worker.
 * @param sessionId - The agent session ID
 * @param stepIndex - The step index to execute
 * @param delay - Optional delay in ms (for wait steps)
 */
export async function enqueueStep(
  sessionId: string,
  stepIndex: number,
  delay?: number,
) {
  const queue = getQueue();
  await queue.add(
    `session-step:${sessionId}:${stepIndex}`,
    { sessionId, stepIndex },
    {
      delay: delay ?? undefined,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );
}
