import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { streamText } from "ai";
import { createProvider } from "./llm-client.js";
import { publishEvent } from "./stream-emitter.js";
import { loadConversationHistory, appendMessage, appendToolCall } from "./db.js";
import { loadSkills } from "./skill-loader.js";
import { pluginManager } from "./hooks.js";
import { startSessionWorker } from "./session-worker.js";
import type { SseEvent } from "@crm-agent/shared/types/events";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10);

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  "agent-jobs",
  async (job) => {
    const { sessionKey, message, workspaceId, model } = job.data as {
      sessionKey: string;
      message: string;
      workspaceId?: string;
      model?: string;
    };

    console.log(`[Worker] Processing job ${job.id} for session ${sessionKey}`);

    await pluginManager.emit("session_start", { sessionKey, workspaceId }, {});
    await pluginManager.emit("message_received", { sessionKey, message }, {});

    // Load conversation history from PostgreSQL
    const history = await loadConversationHistory(sessionKey);

    // Load applicable skills (returns AI SDK-compatible tool definitions)
    const skills = await loadSkills(workspaceId);

    try {
      const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "openai/gpt-4o";
      const result = streamText({
        model: createProvider(model ?? DEFAULT_MODEL),
        messages: [...history, { role: "user" as const, content: message }],
        tools: skills,
        maxSteps: 10,
        onStepFinish: async (step) => {
          // Persist completed step to PostgreSQL
          if (step.text) {
            await appendMessage(sessionKey, {
              role: "assistant",
              content: step.text,
              model: model ?? DEFAULT_MODEL,
              tokensIn: step.usage?.promptTokens,
              tokensOut: step.usage?.completionTokens,
            });
          }

          if (step.toolCalls) {
            for (const tc of step.toolCalls) {
              await pluginManager.emit(
                "after_tool_call",
                { toolName: tc.toolName, args: tc.args, result: tc },
                {},
              );
              await appendToolCall(sessionKey, {
                toolName: tc.toolName,
                toolCallId: tc.toolCallId,
                params: tc.args,
              });
            }
          }
        },
      });

      // Stream text deltas + tool events to Redis for gateway fan-out
      for await (const part of result.fullStream) {
        let event: SseEvent | null = null;

        switch (part.type) {
          case "text-delta":
            event = { type: "text-delta", delta: part.textDelta };
            break;
          case "reasoning":
            event = { type: "reasoning", text: part.textDelta };
            break;
          case "tool-call":
            await pluginManager.emit(
              "before_tool_call",
              { toolName: part.toolName, args: part.args },
              {},
            );
            event = {
              type: "tool-input-available",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            };
            break;
          case "step-finish":
            // Tool results are available through the step-finish event
            event = {
              type: "finish",
              finishReason: "step-complete",
            };
            break;
          case "finish":
            event = {
              type: "finish",
              finishReason: part.finishReason ?? "stop",
            };
            break;
          case "error":
            event = {
              type: "error",
              error:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            };
            break;
        }

        if (event) {
          await publishEvent(sessionKey, event);
        }
      }

      await pluginManager.emit("agent_end", { sessionKey }, {});
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`[Worker] Error processing ${sessionKey}:`, errorMessage);
      await publishEvent(sessionKey, {
        type: "error",
        error: errorMessage,
      });
      await publishEvent(sessionKey, {
        type: "finish",
        finishReason: "error",
      });
    }
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: connection as any,
    concurrency: CONCURRENCY,
  },
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

console.log(`[Worker] Agent worker started (concurrency: ${CONCURRENCY})`);

// Start the session step worker alongside the agent-jobs worker
startSessionWorker();
