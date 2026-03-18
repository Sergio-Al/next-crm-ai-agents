import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";

let _queue: Queue | null = null;

function getEmbeddingQueue() {
  if (!_queue) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _queue = new Queue("product-embeddings", {
      connection: getRedis() as any,
    });
  }
  return _queue;
}

/**
 * Enqueue a product embedding generation job.
 * Called after product create/update — the worker generates the embedding
 * via OpenAI text-embedding-3-small and stores it in the products table.
 */
export async function enqueueEmbedding(productId: string, text: string) {
  const queue = getEmbeddingQueue();
  await queue.add(
    `embed:${productId}`,
    { productId, text },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      // Deduplicate: if the same product is updated multiple times quickly,
      // only the latest embedding job runs
      jobId: `embed:${productId}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  );
}
