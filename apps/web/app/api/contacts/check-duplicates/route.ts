import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

/**
 * GET /api/contacts/check-duplicates?email=...&firstName=...&lastName=...&companyName=...
 *
 * Returns matching contacts using:
 * - Exact email match (case-insensitive)
 * - Name + company equality (both firstName+lastName AND companyName must match)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase() || null;
  const firstName = url.searchParams.get("firstName")?.trim() || null;
  const lastName = url.searchParams.get("lastName")?.trim() || null;
  const companyName = url.searchParams.get("companyName")?.trim() || null;

  if (!email && !firstName) {
    return NextResponse.json({ hasDuplicates: false, matches: [] });
  }

  const db = getDb();
  const conditions = [];

  if (email) {
    conditions.push(
      sql`lower(${schema.contacts.email}) = ${email}`,
    );
  }

  if (firstName && lastName && companyName) {
    conditions.push(
      sql`(
        lower(${schema.contacts.firstName}) = ${firstName.toLowerCase()} AND
        lower(${schema.contacts.lastName}) = ${lastName.toLowerCase()} AND
        lower(${schema.contacts.companyName}) = ${companyName.toLowerCase()}
      )`,
    );
  }

  if (conditions.length === 0) {
    return NextResponse.json({ hasDuplicates: false, matches: [] });
  }

  const where = conditions.length === 1
    ? conditions[0]
    : sql.join(conditions, sql` OR `);

  const rows = await db
    .select({
      id: schema.contacts.id,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      email: schema.contacts.email,
      companyName: schema.contacts.companyName,
    })
    .from(schema.contacts)
    .where(where)
    .limit(5);

  const matches = rows.map((r) => {
    const matchType =
      email && r.email?.toLowerCase() === email ? "email" as const : "name_company" as const;
    return { ...r, matchType };
  });

  return NextResponse.json({
    hasDuplicates: matches.length > 0,
    matches,
  });
}
