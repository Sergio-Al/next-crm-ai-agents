import type { CoreTool } from "ai";
import { z } from "zod";

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
  const tools: Record<string, CoreTool> = {
    // Built-in search tool
    search_contacts: {
      description: "Search for contacts in the CRM by name, email, or phone",
      parameters: z.object({
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
      parameters: z.object({
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
      parameters: z.object({
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
  };

  return tools;
}
