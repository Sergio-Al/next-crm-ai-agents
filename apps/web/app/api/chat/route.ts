import { NextRequest } from "next/server";
import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { readFileSync } from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { sql, eq, and, desc } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import {
  createConversation,
  loadConversationMessages,
  saveMessage,
  touchConversation,
} from "@/lib/chat-persistence";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OPENUI_PROMPT = readFileSync(
  path.join(process.cwd(), "lib/openui-prompt.txt"),
  "utf-8",
);

const CRM_INSTRUCTIONS = `You are a CRM assistant for Acme Corp. You help users manage contacts, deals, the sales pipeline, products, and orders.

You have access to tools that interact with the CRM database. Use them when the user asks about contacts, deals, pipeline, products, or orders.

For READ operations (searching, viewing), use the tools directly — results will be shown to the user immediately.

For WRITE operations (creating contacts, creating deals, updating deal stages, creating orders), ALWAYS call the preview tools immediately (previewCreateContact, previewCreateDeal, previewUpdateDealStage, previewCreateOrder). These render rich interactive forms with contact search, stage dropdowns, and validation — the user can fill in any missing fields directly in the form. NEVER generate openui-lang Form components for CRM write operations. Do NOT say you've created something — the user will confirm via the form.

CRITICAL: When the user asks to create a contact, deal, order, or update a stage, call the appropriate preview tool RIGHT AWAY. Do NOT ask the user for details first. Do NOT list what information you need. Just call the tool immediately with whatever information you have (even if it's nothing) — the form handles the rest. For example, if the user says "create a new deal", call previewCreateDeal immediately with an empty title. Never respond with text asking for fields.

When the user asks about product suggestions or what to recommend for a contact, use the suggestProducts tool. It uses AI-powered semantic search on the product catalog based on the contact's purchase history.

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
 * POST /api/chat — Stream a response using the AI SDK with CRM tools.
 */
export async function POST(req: NextRequest) {
  const { messages, conversationId: existingConvId, locale, context } = (await req.json()) as {
    messages?: Array<{ role: string; content: string }>;
    conversationId?: string;
    locale?: string;
    context?: { type: string; id: string };
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Persistence: create or reuse conversation
  let conversationId = existingConvId;
  if (!conversationId) {
    const conv = await createConversation();
    conversationId = conv.id;
  }

  // Save the latest user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    await saveMessage(conversationId, "user", lastUserMsg.content);
  }

  const db = getDb();
  const model = process.env.DEFAULT_MODEL ?? "gpt-4o";

  let systemPrompt = locale && locale !== "en"
    ? `${SYSTEM_PROMPT}\n\nIMPORTANT: Always respond in the user's language. The current locale is "${locale}". Respond in that language.`
    : SYSTEM_PROMPT;

  // Inject resource context if provided
  if (context && typeof context.id === "string" && context.id.length > 0) {
    if (context.type === "deal") {
      const deal = await db
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
          contactEmail: schema.contacts.email,
        })
        .from(schema.deals)
        .leftJoin(schema.pipelineStages, eq(schema.deals.stageId, schema.pipelineStages.id))
        .leftJoin(schema.contacts, eq(schema.deals.contactId, schema.contacts.id))
        .where(eq(schema.deals.id, context.id))
        .limit(1)
        .then((r) => r[0]);

      if (deal) {
        const contactName = [deal.contactFirstName, deal.contactLastName].filter(Boolean).join(" ");
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this deal:\n- Deal ID: ${deal.id}\n- Title: ${deal.title}\n- Value: ${deal.value ?? "N/A"} ${deal.currency ?? "USD"}\n- Status: ${deal.status}\n- Stage: ${deal.stageName ?? "N/A"}\n- Expected Close: ${deal.expectedClose ?? "N/A"}\n- Contact: ${contactName || "N/A"} (${deal.contactEmail ?? "N/A"})\n\nWhen the user says "this deal" they mean "${deal.title}" (ID: ${deal.id}). Use this context to answer questions and pre-fill tool calls.`;
      }
    } else if (context.type === "contact") {
      const contact = await db.query.contacts.findFirst({
        where: eq(schema.contacts.id, context.id),
      });

      if (contact) {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
        const tags = Array.isArray(contact.tags) ? contact.tags.join(", ") : "";
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this contact:\n- Contact ID: ${contact.id}\n- Name: ${fullName}\n- Email: ${contact.email ?? "N/A"}\n- Phone: ${contact.phone ?? "N/A"}\n- Company: ${contact.companyName ?? "N/A"}\n- Source: ${contact.source ?? "N/A"}\n- Tags: ${tags || "none"}\n\nWhen the user says "this contact" they mean "${fullName}" (ID: ${contact.id}). Use this context to answer questions and pre-fill tool calls.`;
      }
    } else if (context.type === "order") {
      const order = await db
        .select({
          id: schema.orders.id,
          number: schema.orders.number,
          status: schema.orders.status,
          totalAmount: schema.orders.totalAmount,
          currency: schema.orders.currency,
          contactFirstName: schema.contacts.firstName,
          contactLastName: schema.contacts.lastName,
          contactEmail: schema.contacts.email,
          contactId: schema.orders.contactId,
        })
        .from(schema.orders)
        .leftJoin(schema.contacts, eq(schema.orders.contactId, schema.contacts.id))
        .where(eq(schema.orders.id, context.id))
        .limit(1)
        .then((r) => r[0]);

      if (order) {
        const contactName = [order.contactFirstName, order.contactLastName].filter(Boolean).join(" ");
        const items = await db
          .select({
            productName: schema.orderItems.productName,
            quantity: schema.orderItems.quantity,
            lineTotal: schema.orderItems.lineTotal,
          })
          .from(schema.orderItems)
          .where(eq(schema.orderItems.orderId, context.id));

        const itemList = items.map((i) => `  - ${i.productName} x${i.quantity} = ${i.lineTotal}`).join("\n");
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this order:\n- Order ID: ${order.id}\n- Order Number: ${order.number}\n- Status: ${order.status}\n- Total: ${order.totalAmount} ${order.currency ?? "USD"}\n- Contact: ${contactName || "N/A"} (${order.contactEmail ?? "N/A"})\n- Items:\n${itemList}\n\nWhen the user says "this order" they mean "${order.number}" (ID: ${order.id}). Use this context to answer questions. If the user asks for product suggestions, use the contact ID ${order.contactId ?? "N/A"} with suggestProducts.`;
      }
    }
  }

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

      // Write tools — no execute, rendered as forms on client
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
          currentStage: z
            .string()
            .describe("Current stage name for display"),
          newStageId: z.string().uuid().describe("The target stage ID"),
          newStageName: z.string().describe("Target stage name for display"),
        }),
      }),

      previewCreateSession: tool({
        description:
          "Preview creating an agent session — a background multi-step plan (follow-ups, reminders, nurture sequences). The user will review the plan and confirm before it runs. Each step has a type: crm_action, notify, wait, ai_reason, or human_checkpoint.",
        parameters: z.object({
          goal: z.string().describe("The overall goal of the session"),
          steps: z.array(
            z.object({
              type: z.enum(["crm_action", "notify", "wait", "ai_reason", "human_checkpoint"]).describe("Step type"),
              description: z.string().describe("What this step does"),
              config: z.record(z.unknown()).optional().describe("Step-specific config (e.g. { duration: '3d' } for wait, { action: 'create_activity' } for crm_action)"),
            }),
          ).describe("The ordered list of steps in the plan"),
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

      // ── Products & Orders tools ──

      searchProducts: tool({
        description:
          "Search the product catalog by name, SKU, category, or tags. Returns matching active products.",
        parameters: z.object({
          query: z.string().optional().describe("Search term for product name, SKU, or description"),
          category: z.string().optional().describe("Filter by category"),
        }),
        execute: async ({ query, category }) => {
          const conditions = [sql`${schema.products.active} = true`];
          if (query) {
            conditions.push(
              sql`(${schema.products.name} ilike ${"%" + query + "%"} or ${schema.products.sku} ilike ${"%" + query + "%"} or ${schema.products.description} ilike ${"%" + query + "%"})`,
            );
          }
          if (category) {
            conditions.push(sql`${schema.products.category} ilike ${"%" + category + "%"}`);
          }
          const where = sql.join(conditions, sql` and `);

          const rows = await db
            .select({
              id: schema.products.id,
              name: schema.products.name,
              sku: schema.products.sku,
              category: schema.products.category,
              price: schema.products.price,
              currency: schema.products.currency,
              unit: schema.products.unit,
              stockQty: schema.products.stockQty,
            })
            .from(schema.products)
            .where(where)
            .limit(15);

          return { products: rows, total: rows.length };
        },
      }),

      getOrderHistory: tool({
        description:
          "Get order history for a contact. Returns their recent orders with items.",
        parameters: z.object({
          contactId: z.string().uuid().describe("The contact ID to get order history for"),
          limit: z.number().optional().describe("Max orders to return (default 10)"),
        }),
        execute: async ({ contactId, limit: maxOrders }) => {
          const orders = await db
            .select({
              id: schema.orders.id,
              number: schema.orders.number,
              status: schema.orders.status,
              totalAmount: schema.orders.totalAmount,
              currency: schema.orders.currency,
              createdAt: schema.orders.createdAt,
            })
            .from(schema.orders)
            .where(eq(schema.orders.contactId, contactId))
            .orderBy(desc(schema.orders.createdAt))
            .limit(maxOrders ?? 10);

          const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
              const items = await db
                .select({
                  productName: schema.orderItems.productName,
                  quantity: schema.orderItems.quantity,
                  unitPrice: schema.orderItems.unitPrice,
                  lineTotal: schema.orderItems.lineTotal,
                })
                .from(schema.orderItems)
                .where(eq(schema.orderItems.orderId, order.id));
              return { ...order, items };
            }),
          );

          return { orders: ordersWithItems, total: orders.length };
        },
      }),

      suggestProducts: tool({
        description:
          "Get AI-powered product suggestions for a contact based on their purchase history. Uses semantic search on the product catalog.",
        parameters: z.object({
          contactId: z.string().uuid().describe("The contact ID to get suggestions for"),
        }),
        execute: async ({ contactId }) => {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100"}/api/orders/suggest`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId }),
            },
          );
          if (!res.ok) return { error: "Failed to get suggestions" };
          return await res.json();
        },
      }),

      previewCreateOrder: tool({
        description:
          "Preview creating a new order. Call this immediately when the user wants to create an order — the form lets them fill in details. Do NOT ask for fields first.",
        parameters: z.object({
          contactId: z.string().uuid().optional().describe("Contact ID for the order"),
          items: z.array(z.object({
            productId: z.string().uuid().describe("Product ID"),
            quantity: z.number().min(1).describe("Quantity"),
          })).optional().describe("Order line items"),
          notes: z.string().optional().describe("Order notes"),
        }),
      }),

      getOrderStatus: tool({
        description:
          "Get the current status and details of a specific order.",
        parameters: z.object({
          orderId: z.string().uuid().describe("The order ID"),
        }),
        execute: async ({ orderId }) => {
          const order = await db
            .select({
              id: schema.orders.id,
              number: schema.orders.number,
              status: schema.orders.status,
              totalAmount: schema.orders.totalAmount,
              currency: schema.orders.currency,
              createdAt: schema.orders.createdAt,
              confirmedAt: schema.orders.confirmedAt,
              shippedAt: schema.orders.shippedAt,
              deliveredAt: schema.orders.deliveredAt,
              contactFirstName: schema.contacts.firstName,
              contactLastName: schema.contacts.lastName,
            })
            .from(schema.orders)
            .leftJoin(schema.contacts, eq(schema.orders.contactId, schema.contacts.id))
            .where(eq(schema.orders.id, orderId))
            .limit(1)
            .then((r) => r[0]);

          if (!order) return { error: "Order not found" };

          const items = await db
            .select({
              productName: schema.orderItems.productName,
              quantity: schema.orderItems.quantity,
              lineTotal: schema.orderItems.lineTotal,
            })
            .from(schema.orderItems)
            .where(eq(schema.orderItems.orderId, orderId));

          return {
            ...order,
            contactName: [order.contactFirstName, order.contactLastName].filter(Boolean).join(" "),
            items,
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

  return result.toDataStreamResponse({
    headers: { "X-Conversation-Id": conversationId },
  });
}
