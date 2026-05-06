import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const categoriaVentas = url.searchParams.get("categoriaVentas");
  const condicionPago = url.searchParams.get("condicionPago");
  const tipoCuenta = url.searchParams.get("tipoCuenta");
  const bloqueoEntrega = parseBooleanParam(url.searchParams.get("bloqueoEntrega"));
  const bloqueoFactura = parseBooleanParam(url.searchParams.get("bloqueoFactura"));
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const filters = [];

  if (search) {
    const searchPattern = `%${search}%`;
    filters.push(
      or(
        ilike(schema.crmAccounts.name, searchPattern),
        ilike(schema.crmAccounts.nombreComercial, searchPattern),
        ilike(schema.crmAccounts.industry, searchPattern),
        ilike(schema.crmAccounts.sapAccountId, searchPattern),
        ilike(schema.crmAccounts.website, searchPattern),
        ilike(schema.crmAccounts.nitCi, searchPattern),
        ilike(schema.crmAccounts.condicionPago, searchPattern),
      ),
    );
  }

  if (categoriaVentas) {
    filters.push(eq(schema.crmAccounts.categoriaVentas, categoriaVentas));
  }

  if (condicionPago) {
    filters.push(eq(schema.crmAccounts.condicionPago, condicionPago));
  }

  if (tipoCuenta) {
    filters.push(eq(schema.crmAccounts.tipoCuenta, tipoCuenta));
  }

  if (bloqueoEntrega !== undefined) {
    filters.push(eq(schema.crmAccounts.bloqueoEntrega, bloqueoEntrega));
  }

  if (bloqueoFactura !== undefined) {
    filters.push(eq(schema.crmAccounts.bloqueoFactura, bloqueoFactura));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.crmAccounts);

  const [{ count }] = where
    ? await countQuery.where(where)
    : await countQuery;

  const rowsQuery = db
    .select({
      id: schema.crmAccounts.id,
      name: schema.crmAccounts.name,
      nombreComercial: schema.crmAccounts.nombreComercial,
      industry: schema.crmAccounts.industry,
      website: schema.crmAccounts.website,
      categoriaVentas: schema.crmAccounts.categoriaVentas,
      condicionPago: schema.crmAccounts.condicionPago,
      tipoCuenta: schema.crmAccounts.tipoCuenta,
      limiteCredito: schema.crmAccounts.limiteCredito,
      bloqueoEntrega: schema.crmAccounts.bloqueoEntrega,
      bloqueoFactura: schema.crmAccounts.bloqueoFactura,
      sapAccountId: schema.crmAccounts.sapAccountId,
      tags: schema.crmAccounts.tags,
      createdAt: schema.crmAccounts.createdAt,
    })
    .from(schema.crmAccounts)
    .orderBy(desc(schema.crmAccounts.createdAt))
    .limit(limit)
    .offset(offset);

  const rows = where ? await rowsQuery.where(where) : await rowsQuery;

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  });
}
