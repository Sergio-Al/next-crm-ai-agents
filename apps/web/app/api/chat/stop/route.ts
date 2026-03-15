import { NextRequest, NextResponse } from "next/server";
import { endRun } from "@/lib/active-runs";
import { abortSession } from "@/lib/agent-runner";

/**
 * POST /api/chat/stop — Abort a running agent session.
 */
export async function POST(req: NextRequest) {
  const { sessionKey } = (await req.json()) as { sessionKey?: string };

  if (!sessionKey) {
    return NextResponse.json(
      { error: "sessionKey is required" },
      { status: 400 },
    );
  }

  await abortSession(sessionKey);
  await endRun(sessionKey);

  return NextResponse.json({ ok: true });
}
