import { NextResponse } from "next/server";
import { listActiveRuns } from "@/lib/active-runs";

/**
 * GET /api/chat/active — List all currently active agent runs.
 */
export async function GET() {
  const runs = await listActiveRuns();
  return NextResponse.json({ runs });
}
