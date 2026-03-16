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
  loadConversationMessages,
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

/**
 * POST /api/chat/mobile/confirm — Resume a conversation after a write tool form is confirmed or cancelled.
 *
 * The client sends back the tool call context (toolCallId, toolName, args) and the user's result
 * (confirmed + data, or cancelled). We reconstruct the message history with the tool call + result
 * injected, then call streamText() again so the LLM can respond to the confirmation.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    conversationId?: string;
    toolCallId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
    locale?: string;
  };

  const { conversationId, toolCallId, toolName, args, result: toolResult, locale } = body;

  if (!conversationId || !toolCallId || !toolName || !toolResult) {
    return new Response(
      JSON.stringify({ error: "conversationId, toolCallId, toolName, and result are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Load existing conversation messages
  const history = await loadConversationMessages(conversationId);

  // Reconstruct messages: append an assistant message with the tool call,
  // then a tool-result message, so the LLM can continue.
  const messagesForLLM = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "assistant" as const,
      content: [
        {
          type: "tool-call" as const,
          toolCallId,
          toolName,
          args: args ?? {},
        },
      ],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId,
          result: toolResult,
        },
      ],
    },
  ];

  const db = getDb();
  const model = process.env.DEFAULT_MODEL ?? "gpt-4o";

  const systemPrompt =
    locale && locale !== "en"
      ? `${SYSTEM_PROMPT}\n\nIMPORTANT: Always respond in the user's language. The current locale is "${locale}". Respond in that language.`
      : SYSTEM_PROMPT;

  const streamResult = streamText({
    model: openai(model),
    system: systemPrompt,
    messages: messagesForLLM as any,
    maxSteps: 3,
    tools: {
      // Only read tools for the continuation — write tools shouldn't trigger again here
      searchContacts: tool({
        description:
          "Search CRM contacts by name, email, or company. Returns matching contacts.",
        parameters: z.object({
          query: z.string().describe("Search term to match against name, email, or company"),
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
            conditions.push(sql`${schema.deals.title} ilike ${"%" + query + "%"}`);
          }
          if (status) {
            conditions.push(sql`${schema.deals.status} = ${status}`);
          }
          const where =
            conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;

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
          "List all pipeline stages with their IDs.",
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
        await saveMessage(conversationId, "assistant", text, {
          model,
          tokensIn: usage?.promptTokens,
          tokensOut: usage?.completionTokens,
        });
      }
      await touchConversation(conversationId);
    },
  });

  // Stream plain text only
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of streamResult.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(encoder.encode(part.textDelta));
          }
        }
      } catch (err) {
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
