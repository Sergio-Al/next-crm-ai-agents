import type { WebSocketServer } from "ws";

export function healthHandler(
  wss: WebSocketServer,
  sessionSockets: Map<string, Set<unknown>>,
) {
  return {
    status: "ok",
    connections: wss.clients.size,
    activeSessions: sessionSockets.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().heapUsed,
  };
}
