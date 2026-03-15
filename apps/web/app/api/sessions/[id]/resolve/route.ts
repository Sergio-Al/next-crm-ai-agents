import { NextRequest, NextResponse } from "next/server";
import {
  resolveHumanCheckpoint,
  getSession,
} from "@/lib/session-persistence";
import { enqueueStep } from "@/lib/session-queue";

/**
 * POST /api/sessions/[id]/resolve — Approve or reject a human checkpoint.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { approved } = body as { approved?: boolean };

  if (typeof approved !== "boolean") {
    return NextResponse.json(
      { error: "approved (boolean) is required" },
      { status: 400 },
    );
  }

  const result = await resolveHumanCheckpoint(id, approved);
  if (!result) {
    return NextResponse.json(
      { error: "Session not found or not waiting for human input" },
      { status: 400 },
    );
  }

  // If approved, enqueue the next step
  if (result.approved && result.nextStepIndex !== null) {
    await enqueueStep(id, result.nextStepIndex);
  }

  return NextResponse.json({ ok: true, ...result });
}
