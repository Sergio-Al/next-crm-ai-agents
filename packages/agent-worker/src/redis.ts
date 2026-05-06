import { Redis, type RedisOptions } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Create an ioredis instance with a shared error handler and reconnection
 * strategy so ECONNRESET / network blips don't produce unhandled error events
 * or crash the worker process.
 */
export function createRedisConnection(
  extraOptions: RedisOptions = {},
): Redis {
  console.log(`[Redis] Connecting to ${REDIS_URL}`);
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    // Exponential back-off: 50 ms → 2 000 ms, stop after 20 attempts
    retryStrategy(times) {
      if (times > 20) return null; // give up — let BullMQ handle it
      return Math.min(50 * 2 ** times, 2000);
    },
    ...extraOptions,
  });

  client.on("error", (err: Error) => {
    // Log the error instead of letting it bubble as an unhandled event
    console.error("[Redis] connection error:", err.message);
  });

  return client;
}
