import { Worker, Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { createDb } from "@crm-agent/shared/db";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://platform:platform@localhost:6432/platform";

const EMBEDDING_PENDING_LIST = "product-embeddings:pending";
const ACCOUNT_EMBEDDING_PENDING_LIST = "account-embeddings:pending";

const connection = createRedisConnection();
let _db: ReturnType<typeof createDb> | null = null;
function getDb() {
  if (!_db) _db = createDb(DATABASE_URL);
  return _db;
}

function getEmbeddingModel() {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai.embedding("text-embedding-3-small");
}

/**
 * Relay loop: reads JSON payloads pushed by the Python CDC sync service
 * from a simple Redis list and enqueues them into the BullMQ queue so the
 * worker below processes them with the same retry/dedup semantics as jobs
 * from the Next.js API.
 */
async function startPendingRelay() {
  // Separate blocking connection so BLPOP doesn't starve other commands
  const blockingConn = createRedisConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = new Queue("product-embeddings", { connection: connection as any });

  console.log(`[EmbeddingRelay] Watching Redis list: ${EMBEDDING_PENDING_LIST}`);

  (async () => {
    while (true) {
      try {
        const popped = await blockingConn.blpop(EMBEDDING_PENDING_LIST, 0);
        if (!popped) continue;
        const [, raw] = popped;
        const { productId, text } = JSON.parse(raw) as {
          productId: string;
          text: string;
        };
        await queue.add(
          `embed-${productId}`,
          { productId, text },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            jobId: `embed-${productId}`,
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[EmbeddingRelay] error: ${msg}`);
        // Avoid tight loop on persistent errors
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  })();
}

/**
 * Account-embeddings relay — mirrors the product flow but for crm_accounts.
 */
async function startAccountPendingRelay() {
  const blockingConn = createRedisConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = new Queue("account-embeddings", { connection: connection as any });

  console.log(`[AccountEmbeddingRelay] Watching Redis list: ${ACCOUNT_EMBEDDING_PENDING_LIST}`);

  (async () => {
    while (true) {
      try {
        const popped = await blockingConn.blpop(ACCOUNT_EMBEDDING_PENDING_LIST, 0);
        if (!popped) continue;
        const [, raw] = popped;
        const { accountId, text } = JSON.parse(raw) as {
          accountId: string;
          text: string;
        };
        await queue.add(
          `embed-account-${accountId}`,
          { accountId, text },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            jobId: `embed-account-${accountId}`,
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[AccountEmbeddingRelay] error: ${msg}`);
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  })();
}

export function startEmbeddingWorker() {
  const worker = new Worker(
    "product-embeddings",
    async (job) => {
      const { productId, text } = job.data as { productId: string; text: string };

      if (!text?.trim()) {
        console.log(`[EmbeddingWorker] Skipping ${productId} — empty text`);
        return;
      }

      const { embedding } = await embed({
        model: getEmbeddingModel(),
        value: text,
      });

      const db = getDb();
      await db
        .update(schema.products)
        .set({ embedding })
        .where(eq(schema.products.id, productId));

      console.log(`[EmbeddingWorker] Embedded product ${productId} (${embedding.length}d)`);
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: connection as any,
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[EmbeddingWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[EmbeddingWorker] connection error:", err.message);
  });

  console.log("[EmbeddingWorker] Product embedding worker started");

  const accountWorker = new Worker(
    "account-embeddings",
    async (job) => {
      const { accountId, text } = job.data as { accountId: string; text: string };

      if (!text?.trim()) {
        console.log(`[AccountEmbeddingWorker] Skipping ${accountId} — empty text`);
        return;
      }

      const { embedding } = await embed({
        model: getEmbeddingModel(),
        value: text,
      });

      const db = getDb();
      await db
        .update(schema.crmAccounts)
        .set({ embedding })
        .where(eq(schema.crmAccounts.id, accountId));

      console.log(
        `[AccountEmbeddingWorker] Embedded account ${accountId} (${embedding.length}d)`,
      );
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: connection as any,
      concurrency: 3,
    },
  );

  accountWorker.on("failed", (job, err) => {
    console.error(`[AccountEmbeddingWorker] Job ${job?.id} failed:`, err.message);
  });

  accountWorker.on("error", (err) => {
    console.error("[AccountEmbeddingWorker] connection error:", err.message);
  });

  console.log("[AccountEmbeddingWorker] Account embedding worker started");

  // Start the relay loops for CDC-originated embedding requests
  startPendingRelay().catch((err) => {
    console.error("[EmbeddingRelay] Failed to start:", err);
  });
  startAccountPendingRelay().catch((err) => {
    console.error("[AccountEmbeddingRelay] Failed to start:", err);
  });

  return worker;
}
