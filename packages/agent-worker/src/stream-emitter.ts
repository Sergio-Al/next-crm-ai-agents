import { Redis } from "ioredis";
import type { SseEvent } from "@crm-agent/shared/types/events";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

/**
 * Publish an SSE event to Redis Streams for gateway fan-out.
 * Events are written to two streams:
 * 1. Per-session stream (for replay on reconnect)
 * 2. Global gateway-events stream (for live delivery)
 */
export async function publishEvent(
  sessionKey: string,
  event: SseEvent,
): Promise<void> {
  const payload = JSON.stringify(event);

  // Per-session stream for replay
  await redis.xadd(
    `stream:events:${sessionKey}`,
    "*",
    "sessionKey",
    sessionKey,
    "eventType",
    event.type,
    "payload",
    payload,
  );

  // Global stream for gateway consumer group
  await redis.xadd(
    "stream:gateway-events",
    "*",
    "sessionKey",
    sessionKey,
    "eventType",
    event.type,
    "payload",
    payload,
  );
}

/**
 * Set a TTL on the per-session event stream after the session ends.
 * Keeps replay available for reconnections but reclaims memory.
 */
export async function expireSessionStream(
  sessionKey: string,
  ttlSeconds = 3600,
): Promise<void> {
  await redis.expire(`stream:events:${sessionKey}`, ttlSeconds);
}
