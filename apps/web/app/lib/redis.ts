import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _redis: Redis | undefined;

export function getRedis() {
  if (!_redis) {
    _redis = new Redis(REDIS_URL);
  }
  return _redis;
}
