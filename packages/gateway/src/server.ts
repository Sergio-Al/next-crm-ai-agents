import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { nanoid } from "nanoid";
import { authenticate } from "./auth.js";
import { healthHandler } from "./health.js";
import type {
  GatewayReqFrame,
  GatewayResFrame,
  GatewayEventFrame,
} from "@crm-agent/shared/types/protocol";

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? "18789", 10);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const INSTANCE_ID = `gw-${nanoid(8)}`;
const CONSUMER_GROUP = "gateway";

const redis = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);
const jobQueue = new Queue("agent-jobs", { connection: redis as any });

// Track active WebSocket connections by session key
const sessionSockets = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ port: GATEWAY_PORT });

wss.on("connection", (ws, req) => {
  let sessionKey: string | null = null;
  let authenticated = false;

  ws.on("message", async (raw) => {
    let frame: GatewayReqFrame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      ws.send(
        JSON.stringify({
          type: "res",
          id: "unknown",
          ok: false,
          error: "Invalid JSON",
        } satisfies GatewayResFrame),
      );
      return;
    }

    if (frame.type !== "req") return;

    try {
      switch (frame.method) {
        case "connect": {
          const params = frame.params as {
            token?: string;
            password?: string;
          };
          const authResult = await authenticate(params);
          if (!authResult.ok) {
            sendRes(ws, frame.id, false, undefined, "Authentication failed");
            ws.close(4001, "Unauthorized");
            return;
          }
          authenticated = true;
          sendRes(ws, frame.id, true, {
            instanceId: INSTANCE_ID,
            message: "Connected",
          });
          break;
        }

        case "agent": {
          if (!authenticated) {
            sendRes(ws, frame.id, false, undefined, "Not authenticated");
            return;
          }
          const agentParams = frame.params as {
            sessionKey: string;
            message: string;
            workspaceId?: string;
            model?: string;
          };
          sessionKey = agentParams.sessionKey;
          registerSocket(sessionKey, ws);

          // Enqueue job via BullMQ for agent worker consumption
          await jobQueue.add("agent-job", {
            sessionKey: agentParams.sessionKey,
            message: agentParams.message,
            gatewayId: INSTANCE_ID,
            workspaceId: agentParams.workspaceId ?? "",
            model: agentParams.model ?? "",
          });

          sendRes(ws, frame.id, true, { queued: true });
          break;
        }

        case "agent.subscribe": {
          if (!authenticated) {
            sendRes(ws, frame.id, false, undefined, "Not authenticated");
            return;
          }
          const subParams = frame.params as {
            sessionKey: string;
            replay?: boolean;
          };
          sessionKey = subParams.sessionKey;
          registerSocket(sessionKey, ws);

          if (subParams.replay) {
            await replayEvents(ws, sessionKey);
          }

          sendRes(ws, frame.id, true, { subscribed: true });
          break;
        }

        case "chat.abort": {
          if (!authenticated) {
            sendRes(ws, frame.id, false, undefined, "Not authenticated");
            return;
          }
          const abortParams = frame.params as { sessionKey: string };
          await redis.xadd(
            "stream:agent-commands",
            "*",
            "command",
            "abort",
            "sessionKey",
            abortParams.sessionKey,
          );
          sendRes(ws, frame.id, true, { aborted: true });
          break;
        }

        case "health": {
          const info = healthHandler(wss, sessionSockets);
          sendRes(ws, frame.id, true, info);
          break;
        }

        default:
          sendRes(
            ws,
            frame.id,
            false,
            undefined,
            `Unknown method: ${frame.method}`,
          );
      }
    } catch (err) {
      sendRes(
        ws,
        frame.id,
        false,
        undefined,
        err instanceof Error ? err.message : "Internal error",
      );
    }
  });

  ws.on("close", () => {
    if (sessionKey) {
      unregisterSocket(sessionKey, ws);
    }
  });
});

// ─── Redis Streams Event Poller ─────────────────────────────
// Polls events from Redis Streams and fans them out to connected WebSockets

async function startEventPoller() {
  const pollRedis = new Redis(REDIS_URL);

  // Ensure consumer group exists
  try {
    await pollRedis.xgroup(
      "CREATE",
      "stream:gateway-events",
      CONSUMER_GROUP,
      "0",
      "MKSTREAM",
    );
  } catch {
    // Group already exists
  }

  while (true) {
    try {
      const results = await pollRedis.xreadgroup(
        "GROUP",
        CONSUMER_GROUP,
        INSTANCE_ID,
        "COUNT",
        100,
        "BLOCK",
        5000,
        "STREAMS",
        "stream:gateway-events",
        ">",
      );

      if (!results) continue;

      for (const [, entries] of results as [string, [string, string[]][]][]) {
        for (const [id, fields] of entries as [string, string[]][]) {
          const parsed = parseStreamFields(fields);
          const targetSessionKey = parsed.sessionKey;

          if (targetSessionKey) {
            const sockets = sessionSockets.get(targetSessionKey);
            if (sockets) {
              const eventFrame: GatewayEventFrame = {
                type: "event",
                event: parsed.eventType ?? "agent",
                payload: parsed.payload
                  ? JSON.parse(parsed.payload)
                  : undefined,
              };
              const msg = JSON.stringify(eventFrame);
              for (const socket of sockets) {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(msg);
                }
              }
            }
          }

          await pollRedis.xack("stream:gateway-events", CONSUMER_GROUP, id);
        }
      }
    } catch (err) {
      console.error("[Gateway] Event poller error:", err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────

function sendRes(
  ws: WebSocket,
  id: string,
  ok: boolean,
  payload?: unknown,
  error?: unknown,
) {
  ws.send(
    JSON.stringify({ type: "res", id, ok, payload, error } satisfies GatewayResFrame),
  );
}

function registerSocket(key: string, ws: WebSocket) {
  let set = sessionSockets.get(key);
  if (!set) {
    set = new Set();
    sessionSockets.set(key, set);
  }
  set.add(ws);
}

function unregisterSocket(key: string, ws: WebSocket) {
  const set = sessionSockets.get(key);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      sessionSockets.delete(key);
    }
  }
}

async function replayEvents(ws: WebSocket, key: string) {
  const streamKey = `stream:events:${key}`;
  const entries = await redis.xrange(streamKey, "-", "+");
  for (const [, fields] of entries) {
    const parsed = parseStreamFields(fields as string[]);
    const eventFrame: GatewayEventFrame = {
      type: "event",
      event: parsed.eventType ?? "agent",
      payload: parsed.payload ? JSON.parse(parsed.payload) : undefined,
    };
    ws.send(JSON.stringify(eventFrame));
  }
}

function parseStreamFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

// ─── Start ──────────────────────────────────────────────────

startEventPoller().catch(console.error);

console.log(
  `[Gateway] ${INSTANCE_ID} listening on ws://0.0.0.0:${GATEWAY_PORT}`,
);
