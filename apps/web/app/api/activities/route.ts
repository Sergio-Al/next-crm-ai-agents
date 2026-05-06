import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as schema from "@crm-agent/shared/db/schema";

const VALID_TYPES = ["call", "email", "meeting", "note", "task"] as const;
type ActivityType = (typeof VALID_TYPES)[number];

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const {
    type,
    subject,
    body: activityBody,
    contactId,
    dealId,
    scheduledAt,
    durationMin,
  } = body as {
    type?: string;
    subject?: string;
    body?: string;
    contactId?: string;
    dealId?: string;
    scheduledAt?: string;
    durationMin?: number;
  };

  if (!type || !VALID_TYPES.includes(type as ActivityType)) {
    return NextResponse.json(
      { error: `type is required and must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!subject || subject.trim().length === 0) {
    return NextResponse.json(
      { error: "subject is required" },
      { status: 400 },
    );
  }

  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }

  const [activity] = await db
    .insert(schema.activities)
    .values({
      workspaceId: workspace.id,
      type,
      subject,
      body: activityBody || null,
      contactId: contactId || null,
      dealId: dealId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      durationMin: typeof durationMin === "number" ? durationMin : null,
    })
    .returning();

  return NextResponse.json({ data: activity }, { status: 201 });
}
