import { NextRequest } from "next/server";
import { createSSEStream } from "@/lib/agent-runner";
import { getSession } from "@/lib/session-persistence";
import { getDb } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/sessions/[id]/stream — Subscribe to SSE for a session's step events.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return new Response("Invalid session id", { status: 400 });
  }

  const session = await getSession(id);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const db = getDb();
  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    console.error("No workspace found when streaming session");
    return new Response("No workspace found", { status: 500 });
  }

  // Enforce workspace ownership for session stream access.
  if (!session.workspaceId || session.workspaceId !== workspace.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = createSSEStream(`session:${id}`, req.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
