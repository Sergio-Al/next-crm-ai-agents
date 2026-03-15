import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  listSessions,
  type SessionStep,
} from "@/lib/session-persistence";
import { enqueueStep } from "@/lib/session-queue";

/**
 * GET /api/sessions — List agent sessions.
 */
export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

/**
 * POST /api/sessions — Create a new agent session and enqueue the first step.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { goal, plan, conversationId } = body as {
    goal?: string;
    plan?: Array<{
      type: string;
      description: string;
      config?: Record<string, unknown>;
    }>;
    conversationId?: string;
  };

  if (!goal || !plan || !Array.isArray(plan) || plan.length === 0) {
    return NextResponse.json(
      { error: "goal and plan (non-empty array) are required" },
      { status: 400 },
    );
  }

  const session = await createSession({
    goal,
    plan: plan as SessionStep[],
    conversationId: conversationId ?? null,
  });

  // Enqueue the first step
  await enqueueStep(session.id, 0);

  return NextResponse.json({ session }, { status: 201 });
}
