import { tool, type Tool } from "ai";
import { and, eq, isNull, or } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { getDb } from "@/lib/db";
import { zodFromSchema, type ToolInputField } from "./zod-from-schema";
import { buildHttpExecute, type HttpToolConfig } from "./http-executor";

// Loose tool typing because dynamic tools have heterogeneous input/output
// shapes that the AI SDK's strict generic inference can't unify at compile time.
type DynamicTool = Tool<never, never>;

export type LoadedTool = {
  name: string;
  description: string;
  systemPromptHint: string | null;
  tool: DynamicTool;
};

type ToolRow = typeof schema.tools.$inferSelect;

/**
 * Load all enabled registry tools for a workspace (plus globals).
 * Returns AI SDK `tool({})` definitions ready to spread into `streamText({ tools })`.
 *
 * Currently supports `kind: 'http'`. `kind: 'static'` rows are ignored here —
 * static tools are still defined inline in route.ts as code (no extraction yet).
 * `kind: 'query'` is reserved for the visual builder (future).
 */
export async function loadDynamicTools(workspaceId: string | null): Promise<{
  tools: Record<string, DynamicTool>;
  hints: string[];
}> {
  const db = getDb();
  const where = workspaceId
    ? and(
        eq(schema.tools.enabled, true),
        isNull(schema.tools.deletedAt),
        or(
          isNull(schema.tools.workspaceId),
          eq(schema.tools.workspaceId, workspaceId),
        ),
      )
    : and(
        eq(schema.tools.enabled, true),
        isNull(schema.tools.deletedAt),
        isNull(schema.tools.workspaceId),
      );

  const rows = await db.select().from(schema.tools).where(where);

  // Resolve workspace allowlist for HTTP SSRF protection.
  let allowlist: string[] = [];
  if (workspaceId) {
    const ws = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, workspaceId),
    });
    const settings = (ws?.settings ?? {}) as { httpToolAllowlist?: unknown };
    if (Array.isArray(settings.httpToolAllowlist)) {
      allowlist = settings.httpToolAllowlist.filter(
        (s): s is string => typeof s === "string",
      );
    }
  }

  const out: Record<string, DynamicTool> = {};
  const hints: string[] = [];

  for (const row of rows) {
    if (row.kind !== "http") continue; // only http supported in dynamic loader for now
    const def = buildToolFromRow(row, allowlist);
    if (def) {
      out[def.name] = def.tool;
      if (def.systemPromptHint) hints.push(def.systemPromptHint);
    }
  }

  return { tools: out, hints };
}

function buildToolFromRow(
  row: ToolRow,
  allowlist: string[],
): LoadedTool | null {
  const fields = (row.inputSchema ?? []) as ToolInputField[];
  const inputSchema = zodFromSchema(fields);

  if (row.kind === "http") {
    const config = row.config as HttpToolConfig | null;
    if (!config?.url || !config.method) return null;
    const exec = buildHttpExecute(config, { allowlist });

    return {
      name: row.name,
      description: row.description ?? "",
      systemPromptHint: row.systemPromptHint ?? null,
      tool: tool({
        description: row.description ?? "",
        inputSchema,
        execute: async (args: Record<string, unknown>) => exec(args),
      }) as unknown as DynamicTool,
    };
  }

  return null;
}
