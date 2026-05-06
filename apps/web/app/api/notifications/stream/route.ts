import { NextRequest } from "next/server";
import { createSSEStream } from "@/lib/agent-runner";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/notifications/stream — SSE endpoint for real-time notifications.
 *
 * Subscribes to `stream:events:user:{userId}` via the shared
 * `createSSEStream` helper and forwards events to the browser.
 *
 * Auth: dev convention — first workspace + first member.
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return new Response("No workspace found", { status: 500 });
  }
  const member = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.workspaceId, workspace.id),
  });
  if (!member) {
    return new Response("No member found", { status: 403 });
  }

  const stream = createSSEStream(`user:${member.userId}`, req.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
