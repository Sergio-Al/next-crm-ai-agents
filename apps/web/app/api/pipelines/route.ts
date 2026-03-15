import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET() {
  const db = getDb();

  const pipelines = await db
    .select({
      id: schema.pipelines.id,
      name: schema.pipelines.name,
      isDefault: schema.pipelines.isDefault,
    })
    .from(schema.pipelines)
    .orderBy(schema.pipelines.createdAt);

  const stages = await db
    .select({
      id: schema.pipelineStages.id,
      pipelineId: schema.pipelineStages.pipelineId,
      name: schema.pipelineStages.name,
      position: schema.pipelineStages.position,
      winProbability: schema.pipelineStages.winProbability,
      dealCount: sql<number>`count(${schema.deals.id})::int`,
      totalValue: sql<string>`coalesce(sum(${schema.deals.value}), 0)`,
    })
    .from(schema.pipelineStages)
    .leftJoin(
      schema.deals,
      sql`${schema.deals.stageId} = ${schema.pipelineStages.id} and ${schema.deals.status} = 'open'`
    )
    .groupBy(
      schema.pipelineStages.id,
      schema.pipelineStages.pipelineId,
      schema.pipelineStages.name,
      schema.pipelineStages.position,
      schema.pipelineStages.winProbability
    )
    .orderBy(schema.pipelineStages.position);

  return NextResponse.json({ pipelines, stages });
}
