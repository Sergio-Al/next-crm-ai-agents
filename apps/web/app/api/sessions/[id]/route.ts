import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  updateSessionStatus,
} from "@/lib/session-persistence";
import { enqueueStep } from "@/lib/session-queue";

/**
 * GET /api/sessions/[id] — Get session detail with events.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

/**
 * PATCH /api/sessions/[id] — Pause, resume, or cancel a session.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action?: "pause" | "resume" | "cancel" };

  if (!action || !["pause", "resume", "cancel"].includes(action)) {
    return NextResponse.json(
      { error: "action must be pause, resume, or cancel" },
      { status: 400 },
    );
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  switch (action) {
    case "pause": {
      if (session.status !== "running") {
        return NextResponse.json(
          { error: "Can only pause a running session" },
          { status: 400 },
        );
      }
      await updateSessionStatus(id, "paused");
      break;
    }
    case "resume": {
      if (session.status !== "paused") {
        return NextResponse.json(
          { error: "Can only resume a paused session" },
          { status: 400 },
        );
      }
      await updateSessionStatus(id, "running");
      await enqueueStep(id, session.currentStepIndex);
      break;
    }
    case "cancel": {
      if (["completed", "cancelled", "failed"].includes(session.status)) {
        return NextResponse.json(
          { error: "Session is already terminal" },
          { status: 400 },
        );
      }
      await updateSessionStatus(id, "cancelled");
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    status: action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "running",
  });
}
