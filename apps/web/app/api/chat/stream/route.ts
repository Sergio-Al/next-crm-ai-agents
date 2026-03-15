import { NextRequest } from "next/server";
import { createSSEStream } from "@/lib/agent-runner";

/**
 * GET /api/chat/stream?sessionKey=... — Reconnect to an active SSE stream.
 */
export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");

  if (!sessionKey) {
    return new Response("sessionKey query parameter required", { status: 400 });
  }

  const stream = createSSEStream(sessionKey, req.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
