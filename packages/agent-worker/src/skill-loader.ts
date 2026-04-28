import type { CoreTool } from "ai";
import { z } from "zod/v3";

/**
 * Load skill/tool definitions for a workspace.
 * Returns AI SDK-compatible tool definitions.
 *
 * In the full implementation, this loads from:
 * 1. Database (tools registry table)
 * 2. Skill files (skills/SKILL.md in each skill folder)
 * 3. MCP servers (Model Context Protocol)
 *
 * For now, returns a basic set of built-in tools.
 */
export async function loadSkills(
  _workspaceId?: string,
): Promise<Record<string, CoreTool>> {
  const workspaceId = _workspaceId;
  const tools: Record<string, CoreTool> = {
    // Built-in search tool
    search_contacts: {
      description: "Search for contacts in the CRM by name, email, or phone",
      inputSchema: z.object({
        query: z.string().describe("Search query (name, email, or phone)"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Max results to return"),
      }),
      execute: async ({ query, limit }) => {
        // TODO: Connect to PostgreSQL contacts table
        return {
          results: [],
          query,
          limit,
          message: "Contact search not yet connected to database",
        };
      },
    },

    // Built-in deal lookup tool
    get_deal: {
      description: "Get details of a specific deal by its ID",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID"),
      }),
      execute: async ({ dealId }) => {
        // TODO: Connect to PostgreSQL deals table
        return {
          dealId,
          message: "Deal lookup not yet connected to database",
        };
      },
    },

    // Built-in activity logger
    log_activity: {
      description:
        "Log a CRM activity (call, email, meeting, note) for a contact or deal",
      inputSchema: z.object({
        type: z.enum(["call", "email", "meeting", "note", "task"]),
        subject: z.string().describe("Activity subject/title"),
        body: z.string().optional().describe("Activity details"),
        contactId: z
          .string()
          .uuid()
          .optional()
          .describe("Associated contact ID"),
        dealId: z.string().uuid().optional().describe("Associated deal ID"),
      }),
      execute: async (params) => {
        // TODO: Connect to PostgreSQL activities table
        return {
          ...params,
          message: "Activity logging not yet connected to database",
        };
      },
    },

    // Semantic product search via pgvector
    search_products_similar: {
      description:
        "Find products similar to a natural-language query using semantic vector search over the product catalog. Use this whenever the user asks to find, recommend, suggest, or look up products by description, use-case, brand, family, or any free-form criteria. Returns name, brand, type, family/group, min_price, availability, and approval status.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Natural-language product query (e.g. 'aceite lubricante industrial', 'bici montaña roja', 'filtro de aire para motor diesel')",
          ),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
      execute: async ({ query, limit }) => {
        if (!workspaceId) {
          return { error: "workspace context missing" };
        }
        const { createOpenAI } = await import("@ai-sdk/openai");
        const { embed } = await import("ai");
        const { createDb } = await import("@crm-agent/shared/db");
        const { sql } = await import("drizzle-orm");

        const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const { embedding } = await embed({
          model: openai.embedding("text-embedding-3-small"),
          value: query,
        });

        const db = createDb(
          process.env.DATABASE_URL ??
            process.env.POSTGRES_URL ??
            "postgresql://platform:platform@localhost:6432/platform",
        );

        const vectorLiteral = `[${embedding.join(",")}]`;
        const rows = await db.execute(sql`
          SELECT id, name, brand, type, category, family_name, group_name,
                 min_price, available, approved, image_url,
                 embedding <=> ${vectorLiteral}::vector AS distance
          FROM products
          WHERE workspace_id = ${workspaceId}
            AND active = true
            AND embedding IS NOT NULL
          ORDER BY distance ASC
          LIMIT ${limit}
        `);

        return { query, count: rows.rows.length, results: rows.rows };
      },
    },
  };

  return tools;
}
