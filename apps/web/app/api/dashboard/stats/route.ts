import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET() {
  const db = getDb();

  const [contactCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.contacts);

  const [dealStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalValue: sql<string>`coalesce(sum(value), 0)`,
    })
    .from(schema.deals)
    .where(sql`${schema.deals.status} = 'open'`);

  const [leadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(sql`${schema.leads.status} = 'new' or ${schema.leads.status} = 'contacted'`);

  const recentContacts = await db
    .select({
      id: schema.contacts.id,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      email: schema.contacts.email,
      companyName: schema.contacts.companyName,
    })
    .from(schema.contacts)
    .orderBy(sql`${schema.contacts.createdAt} desc`)
    .limit(5);

  const stages = await db
    .select({
      name: schema.pipelineStages.name,
      dealCount: sql<number>`count(${schema.deals.id})::int`,
      totalValue: sql<string>`coalesce(sum(${schema.deals.value}), 0)`,
    })
    .from(schema.pipelineStages)
    .leftJoin(schema.deals, sql`${schema.deals.stageId} = ${schema.pipelineStages.id} and ${schema.deals.status} = 'open'`)
    .groupBy(schema.pipelineStages.name, schema.pipelineStages.position)
    .orderBy(schema.pipelineStages.position);

  return NextResponse.json({
    totalContacts: contactCount.count,
    activeDeals: dealStats.count,
    pipelineValue: dealStats.totalValue,
    openLeads: leadCount.count,
    recentContacts,
    stages,
  });
}
