import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const where = search
    ? sql`(
        ${schema.contacts.firstName} ilike ${"%" + search + "%"} or
        ${schema.contacts.lastName} ilike ${"%" + search + "%"} or
        (${schema.contacts.firstName} || ' ' || ${schema.contacts.lastName}) ilike ${"%" + search + "%"} or
        ${schema.contacts.email} ilike ${"%" + search + "%"} or
        ${schema.contacts.companyName} ilike ${"%" + search + "%"}
      )`
    : sql`true`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.contacts)
    .where(where);

  const rows = await db
    .select({
      id: schema.contacts.id,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      email: schema.contacts.email,
      companyName: schema.contacts.companyName,
      source: schema.contacts.source,
      tags: schema.contacts.tags,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .where(where)
    .orderBy(sql`${schema.contacts.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const { firstName, lastName, email, phone, companyName, source } = body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    source?: string;
  };

  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "firstName and lastName are required" },
      { status: 400 },
    );
  }

  const workspace = await db.query.workspaces.findFirst();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 500 });
  }

  const [contact] = await db
    .insert(schema.contacts)
    .values({
      workspaceId: workspace.id,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      companyName: companyName || null,
      source: source || null,
    })
    .returning();

  return NextResponse.json({ data: contact }, { status: 201 });
}
