import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET() {
  const db = getDb();

  const deals = await db
    .select({
      id: schema.deals.id,
      title: schema.deals.title,
      value: schema.deals.value,
      currency: schema.deals.currency,
      status: schema.deals.status,
      stageId: schema.deals.stageId,
      expectedClose: schema.deals.expectedClose,
      contactFirstName: schema.contacts.firstName,
      contactLastName: schema.contacts.lastName,
      createdAt: schema.deals.createdAt,
    })
    .from(schema.deals)
    .leftJoin(schema.contacts, sql`${schema.deals.contactId} = ${schema.contacts.id}`)
    .where(sql`${schema.deals.status} = 'open'`)
    .orderBy(sql`${schema.deals.createdAt} desc`);

  return NextResponse.json({ data: deals });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const { title, value, contactId, stageId } = body as {
    title?: string;
    value?: string;
    contactId?: string;
    stageId?: string;
  };

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }

  // Get default pipeline + first stage if not specified
  const pipeline = await db.query.pipelines.findFirst();
  if (!pipeline) {
    return NextResponse.json({ error: "No pipeline found" }, { status: 500 });
  }

  let resolvedStageId = stageId;
  if (!resolvedStageId) {
    const firstStage = await db
      .select({ id: schema.pipelineStages.id })
      .from(schema.pipelineStages)
      .where(sql`${schema.pipelineStages.pipelineId} = ${pipeline.id}`)
      .orderBy(schema.pipelineStages.position)
      .limit(1);
    resolvedStageId = firstStage[0]?.id;
  }

  if (!resolvedStageId) {
    return NextResponse.json({ error: "No stages found" }, { status: 500 });
  }

  const [deal] = await db
    .insert(schema.deals)
    .values({
      workspaceId: workspace.id,
      pipelineId: pipeline.id,
      stageId: resolvedStageId,
      title,
      value: value || null,
      contactId: contactId || null,
      status: "open",
    })
    .returning();

  return NextResponse.json({ data: deal }, { status: 201 });
}
