import { NextRequest } from "next/server";
import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { readFileSync } from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { sql, eq } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import {
  createConversation,
  saveMessage,
  touchConversation,
} from "@/lib/chat-persistence";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OPENUI_PROMPT = readFileSync(
  path.join(process.cwd(), "lib/openui-prompt.txt"),
  "utf-8",
);

const CRM_INSTRUCTIONS = `You are a CRM assistant for Acme Corp. You help users manage contacts, deals, and the sales pipeline.

You have access to tools that interact with the CRM database. Use them when the user asks about contacts, deals, or pipeline.

For READ operations (searching, viewing), use the tools directly — results will be shown to the user immediately.

For WRITE operations (creating contacts, creating deals, updating deal stages), ALWAYS call the preview tools immediately (previewCreateContact, previewCreateDeal, previewUpdateDealStage). These render rich interactive forms with contact search, stage dropdowns, and validation — the user can fill in any missing fields directly in the form. NEVER generate openui-lang Form components for CRM write operations. Do NOT say you've created something — the user will confirm via the form.

CRITICAL: When the user asks to create a contact, deal, or update a stage, call the appropriate preview tool RIGHT AWAY. Do NOT ask the user for details first. Do NOT list what information you need. Just call the tool immediately with whatever information you have (even if it's nothing) — the form handles the rest. For example, if the user says "create a new deal", call previewCreateDeal immediately with an empty title. Never respond with text asking for fields.

You can also create agent sessions — background processes that execute multi-step plans like follow-ups, reminders, and nurture sequences. Use previewCreateSession to propose a plan with steps. Step types:
- crm_action: Execute a CRM operation (create activity, update record)
- notify: Send a notification to the user
- wait: Pause for a duration (e.g. { duration: "3d" })
- ai_reason: Use AI to analyze context and decide next action
- human_checkpoint: Pause and ask the user for approval before continuing

Use getSessionStatus to check on a running session.

Be concise and helpful. Format monetary values with currency symbols.`;

const SYSTEM_PROMPT = `${OPENUI_PROMPT}

---

${CRM_INSTRUCTIONS}`;

const PENDING_ACTION_DELIMITER = "\n__PENDING_ACTION__\n";

const WRITE_TOOLS = new Set([
  "previewCreateContact",
  "previewCreateDeal",
  "previewUpdateDealStage",
  "previewCreateSession",
]);

/**
 * POST /api/chat/mobile — Stream a plain-text response for the React Native client.
 *
 * Read tools execute server-side; the LLM sees the results and generates openui-lang.
 * Write tools (no execute) emit a PENDING_ACTION delimiter + JSON so the client can
 * open a native confirmation form.
 */
export async function POST(req: NextRequest) {
  const { messages, conversationId: existingConvId, locale } = (await req.json()) as {
    messages?: Array<{ role: string; content: string }>;
    conversationId?: string;
    locale?: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Server-side payload guardrail: reject oversized message payloads
  const totalChars = messages.reduce(
    (sum: number, m: { content?: string }) => sum + (m.content?.length ?? 0),
    0,
  );
  const MAX_PAYLOAD_CHARS = 120_000; // ~30k tokens
  if (totalChars > MAX_PAYLOAD_CHARS) {
    return new Response(
      JSON.stringify({
        error: "Message payload too large. Please start a new conversation or shorten your messages.",
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  let conversationId = existingConvId;
  if (!conversationId) {
    const conv = await createConversation();
    conversationId = conv.id;
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    await saveMessage(conversationId, "user", lastUserMsg.content);
  }

  const db = getDb();
  const model = process.env.DEFAULT_MODEL ?? "gpt-4o";

  const systemPrompt =
    locale && locale !== "en"
      ? `${SYSTEM_PROMPT}\n\nIMPORTANT: Always respond in the user's language. The current locale is "${locale}". Respond in that language.`
      : SYSTEM_PROMPT;

  const result = streamText({
    model: openai(model),
    system: systemPrompt,
    messages: messages as Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
    maxSteps: 5,
    tools: {
      searchContacts: tool({
        description:
          "Search CRM contacts by name, email, or company. Returns matching contacts.",
        parameters: z.object({
          query: z
            .string()
            .describe("Search term to match against name, email, or company"),
        }),
        execute: async ({ query }) => {
          const where = sql`(
            ${schema.contacts.firstName} ilike ${"%" + query + "%"} or
            ${schema.contacts.lastName} ilike ${"%" + query + "%"} or
            (${schema.contacts.firstName} || ' ' || ${schema.contacts.lastName}) ilike ${"%" + query + "%"} or
            ${schema.contacts.email} ilike ${"%" + query + "%"} or
            ${schema.contacts.companyName} ilike ${"%" + query + "%"}
          )`;
          const rows = await db
            .select({
              id: schema.contacts.id,
              firstName: schema.contacts.firstName,
              lastName: schema.contacts.lastName,
              email: schema.contacts.email,
              phone: schema.contacts.phone,
              companyName: schema.contacts.companyName,
              source: schema.contacts.source,
              tags: schema.contacts.tags,
            })
            .from(schema.contacts)
            .where(where)
            .limit(10);
          return { contacts: rows, total: rows.length };
        },
      }),

      getContact: tool({
        description:
          "Get detailed info for a specific contact by ID, including their deals.",
        parameters: z.object({
          contactId: z.string().uuid().describe("The contact ID"),
        }),
        execute: async ({ contactId }) => {
          const contact = await db.query.contacts.findFirst({
            where: eq(schema.contacts.id, contactId),
          });
          if (!contact) return { error: "Contact not found" };

          const deals = await db
            .select({
              id: schema.deals.id,
              title: schema.deals.title,
              value: schema.deals.value,
              status: schema.deals.status,
              stageName: schema.pipelineStages.name,
            })
            .from(schema.deals)
            .leftJoin(
              schema.pipelineStages,
              eq(schema.deals.stageId, schema.pipelineStages.id),
            )
            .where(eq(schema.deals.contactId, contactId));

          return { contact, deals };
        },
      }),

      searchDeals: tool({
        description:
          "Search deals by title or filter by status. Returns matching deals with stage info.",
        parameters: z.object({
          query: z.string().optional().describe("Search term for deal title"),
          status: z
            .enum(["open", "won", "lost"])
            .optional()
            .describe("Filter by deal status"),
        }),
        execute: async ({ query, status }) => {
          const conditions = [];
          if (query) {
            conditions.push(
              sql`${schema.deals.title} ilike ${"%" + query + "%"}`,
            );
          }
          if (status) {
            conditions.push(sql`${schema.deals.status} = ${status}`);
          }
          const where =
            conditions.length > 0
              ? sql.join(conditions, sql` and `)
              : sql`true`;

          const rows = await db
            .select({
              id: schema.deals.id,
              title: schema.deals.title,
              value: schema.deals.value,
              currency: schema.deals.currency,
              status: schema.deals.status,
              expectedClose: schema.deals.expectedClose,
              stageName: schema.pipelineStages.name,
              contactFirstName: schema.contacts.firstName,
              contactLastName: schema.contacts.lastName,
            })
            .from(schema.deals)
            .leftJoin(
              schema.pipelineStages,
              eq(schema.deals.stageId, schema.pipelineStages.id),
            )
            .leftJoin(
              schema.contacts,
              eq(schema.deals.contactId, schema.contacts.id),
            )
            .where(where)
            .orderBy(sql`${schema.deals.createdAt} desc`)
            .limit(10);

          return { deals: rows, total: rows.length };
        },
      }),

      listPipelineStages: tool({
        description:
          "List all pipeline stages with their IDs. Use this to get stage IDs for creating/moving deals.",
        parameters: z.object({}),
        execute: async () => {
          const stages = await db
            .select({
              id: schema.pipelineStages.id,
              name: schema.pipelineStages.name,
              position: schema.pipelineStages.position,
              pipelineId: schema.pipelineStages.pipelineId,
              winProbability: schema.pipelineStages.winProbability,
            })
            .from(schema.pipelineStages)
            .orderBy(schema.pipelineStages.position);
          return { stages };
        },
      }),

      previewCreateContact: tool({
        description:
          "Preview creating a new contact. Call this immediately when the user wants to create a contact — the form lets them fill in details. Do NOT ask for fields first.",
        parameters: z.object({
          firstName: z.string().optional().describe("First name if known"),
          lastName: z.string().optional().describe("Last name if known"),
          email: z.string().optional().describe("Email address"),
          phone: z.string().optional().describe("Phone number"),
          companyName: z.string().optional().describe("Company name"),
          source: z.string().optional().describe("Lead source"),
        }),
      }),

      previewCreateDeal: tool({
        description:
          "Preview creating a new deal. Call this immediately when the user wants to create a deal — the form lets them fill in details. Do NOT ask for fields first.",
        parameters: z.object({
          title: z.string().optional().describe("Deal title if known"),
          value: z.string().optional().describe("Deal value as a number string"),
          contactId: z
            .string()
            .uuid()
            .optional()
            .describe("Contact ID to link"),
          stageId: z
            .string()
            .uuid()
            .optional()
            .describe("Pipeline stage ID"),
        }),
      }),

      previewUpdateDealStage: tool({
        description:
          "Preview moving a deal to a different pipeline stage. The user will confirm the change.",
        parameters: z.object({
          dealId: z.string().uuid().describe("The deal ID to update"),
          dealTitle: z.string().describe("The deal title for display"),
          currentStage: z.string().describe("Current stage name for display"),
          newStageId: z.string().uuid().describe("The target stage ID"),
          newStageName: z.string().describe("Target stage name for display"),
        }),
      }),

      previewCreateSession: tool({
        description:
          "Preview creating an agent session — a background multi-step plan (follow-ups, reminders, nurture sequences). The user will review the plan and confirm before it runs. Each step has a type: crm_action, notify, wait, ai_reason, or human_checkpoint.",
        parameters: z.object({
          goal: z.string().describe("The overall goal of the session"),
          steps: z
            .array(
              z.object({
                type: z
                  .enum(["crm_action", "notify", "wait", "ai_reason", "human_checkpoint"])
                  .describe("Step type"),
                description: z.string().describe("What this step does"),
                config: z
                  .record(z.unknown())
                  .optional()
                  .describe("Step-specific config"),
              }),
            )
            .describe("The ordered list of steps in the plan"),
        }),
      }),

      getSessionStatus: tool({
        description:
          "Get the current status of an agent session, including goal, progress, and recent events.",
        parameters: z.object({
          sessionId: z.string().uuid().describe("The agent session ID"),
        }),
        execute: async ({ sessionId }) => {
          const session = await db.query.agentSessions.findFirst({
            where: eq(schema.agentSessions.id, sessionId),
          });
          if (!session) return { error: "Session not found" };

          const events = await db
            .select()
            .from(schema.sessionEvents)
            .where(eq(schema.sessionEvents.sessionId, sessionId))
            .orderBy(sql`${schema.sessionEvents.createdAt} desc`)
            .limit(5);

          const plan = session.plan as Array<{ type: string; description: string }>;
          return {
            id: session.id,
            goal: session.goal,
            status: session.status,
            currentStepIndex: session.currentStepIndex,
            totalSteps: plan.length,
            nextRunAt: session.nextRunAt,
            recentEvents: events,
          };
        },
      }),
    },
    onFinish: async ({ text, usage }) => {
      if (text) {
        await saveMessage(conversationId!, "assistant", text, {
          model,
          tokensIn: usage?.promptTokens,
          tokensOut: usage?.completionTokens,
        });
      }
      await touchConversation(conversationId!);
    },
  });

  // Stream plain text to the client, intercepting write tool calls
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(encoder.encode(part.textDelta));
          } else if (part.type === "tool-call" && WRITE_TOOLS.has(part.toolName)) {
            // Write tool detected — emit pending action and stop
            const payload = JSON.stringify({
              action: part.toolName,
              toolCallId: part.toolCallId,
              args: part.args,
            });
            controller.enqueue(encoder.encode(PENDING_ACTION_DELIMITER + payload));
            break;
          }
          // Read tool calls, tool results, and other parts are consumed silently —
          // the LLM sees the results via maxSteps and generates text.
        }
      } catch (err) {
        // Stream errors are not recoverable; close gracefully
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Conversation-Id": conversationId,
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
