import { NextRequest } from "next/server";
import { streamText, tool, stepCountIs, convertToModelMessages, embed, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from 'zod';
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

For WRITE operations (creating contacts, creating deals, updating deal stages, creating orders, updating order status), ALWAYS call the preview tools immediately (previewCreateContact, previewCreateDeal, previewUpdateDealStage, previewCreateOrder, previewUpdateOrderStatus). These render rich interactive forms with contact search, stage dropdowns, and validation — the user can fill in any missing fields directly in the form. NEVER generate openui-lang Form components for CRM write operations. Do NOT say you've created something — the user will confirm via the form.

CRITICAL: When the user asks to create a contact, deal, order, or update a stage, call the appropriate preview tool RIGHT AWAY. Do NOT ask the user for details first. Do NOT list what information you need. Just call the tool immediately with whatever information you have (even if it's nothing) — the form handles the rest. For example, if the user says "create a new deal", call previewCreateDeal immediately with an empty title. Never respond with text asking for fields.

When the user asks about product suggestions or what to recommend for a contact OR account, use the suggestProducts tool. Pass contactId for an individual person, OR accountId for a company-level recommendation (aggregates all that account's orders). It uses pgvector centroid search over the contact/account's purchase history, excluding already-purchased products, and reranks with reasoning.

CROSS-SELL FROM PEERS — IMPORTANT:
- Use **crossSellFromPeers** when the user asks about *peer-based* / *collaborative* recommendations: "what are similar accounts buying", "cross-sell ideas based on peers", "what do customers like this one buy", "qué compran clientes parecidos a este". This finds K most similar accounts by purchase-vector centroid and recommends products those peers bought that the subject hasn't.
- Use **suggestProducts** for own-history-based recommendations ("what should I recommend to this customer", "next best product for them").
- When ambiguous, prefer suggestProducts. When the user explicitly says "peers", "similar accounts", "other customers", "comparable accounts", use crossSellFromPeers.
- Both tools accept contactId or accountId. crossSellFromPeers operates at the account level — a contactId is internally resolved to its accountId.

When crossSellFromPeers or suggestProducts return results, render them as an openui-lang Card/Table with columns Producto, SKU, Precio, and a Razón column for the per-product reason. For crossSellFromPeers also include a "# peers" column showing how many similar accounts bought each product. Do NOT repeat the raw JSON.

PRODUCT SEARCH — IMPORTANT:
- **Default tool: search_products_similar** (pgvector semantic search). Use it for ALL product discovery, including: "recomiéndame productos con X", "productos para Y", "busca productos de Z", ingredient names (diclofenaco, ibuprofeno, paracetamol, bicarbonato, etc.), symptoms, use-cases, brand names, or any natural-language product query.
- **Only use searchProducts when** the user gives an exact SKU code (e.g. "210000046") or asks to filter strictly by an exact category field.
- Ingredient/active-substance names (even if specific) are natural-language queries → use search_products_similar.
- When in doubt, use search_products_similar.

When search_products_similar returns results, render them as an openui-lang Card/Table with columns Nombre, SKU, Precio, and include the brand/family when relevant. Do NOT repeat the raw JSON.

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
    messages?: UIMessage[];
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
    const text = lastUserMsg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    await saveMessage(conversationId, "user", text);
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
        const accountLine = contact.accountId
          ? `\n- Account ID: ${contact.accountId} (use for crossSellFromPeers and account-level suggestProducts)`
          : "";
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this contact:\n- Contact ID: ${contact.id}\n- Name: ${fullName}\n- Email: ${contact.email ?? "N/A"}\n- Phone: ${contact.phone ?? "N/A"}\n- Company: ${contact.companyName ?? "N/A"}\n- Source: ${contact.source ?? "N/A"}\n- Tags: ${tags || "none"}${accountLine}\n\nWhen the user says "this contact" they mean "${fullName}" (ID: ${contact.id}). Use this context to answer questions and pre-fill tool calls. For peer/cross-sell questions about "similar customers", call crossSellFromPeers with this contact's accountId (if available) or contactId.`;
      }
    } else if (context.type === "account") {
      const account = await db.query.crmAccounts.findFirst({
        where: eq(schema.crmAccounts.id, context.id),
      });

      if (account) {
        const stats = await db
          .select({
            orderCount: sql<number>`count(*)::int`,
            totalRevenue: sql<string>`coalesce(sum(${schema.orders.totalAmount}), 0)::text`,
            lastOrderAt: sql<string | null>`max(${schema.orders.createdAt})::text`,
          })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.accountId, account.id),
              eq(schema.orders.status, "confirmed"),
            ),
          )
          .then((r) => r[0]);

        const tags = Array.isArray(account.tags) ? account.tags.join(", ") : "";
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this account:\n- Account ID: ${account.id}\n- Name: ${account.name}\n- Industry: ${account.industry ?? "N/A"}\n- SAP ID: ${account.sapAccountId ?? "N/A"}\n- Tags: ${tags || "none"}\n- Confirmed orders: ${stats?.orderCount ?? 0}\n- Lifetime revenue (confirmed): ${stats?.totalRevenue ?? "0"}\n- Last order: ${stats?.lastOrderAt ?? "N/A"}\n\nWhen the user says "this account" / "this customer" / "this company" they mean "${account.name}" (ID: ${account.id}). Use this context to answer questions and pre-fill tool calls. For "what are peers/similar accounts buying" use crossSellFromPeers with accountId="${account.id}". For "what should we recommend to them based on their own history" use suggestProducts with accountId="${account.id}".`;
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
        systemPrompt += `\n\n## Active Context\nThe user is currently viewing this order:\n- Order ID: ${order.id}\n- Order Number: ${order.number}\n- Status: ${order.status}\n- Total: ${order.totalAmount} ${order.currency ?? "USD"}\n- Contact: ${contactName || "N/A"} (${order.contactEmail ?? "N/A"})\n- Items:\n${itemList}\n\nWhen the user says "this order" they mean "${order.number}" (ID: ${order.id}). Use this context to answer questions and pre-fill tool calls. If the user asks to change the order status, use previewUpdateOrderStatus with the order ID, number, and current status already filled in. If the user asks for product suggestions, use the contact ID ${order.contactId ?? "N/A"} with suggestProducts.`;
      }
    }
  }

  const result = streamText({
    model: openai(model),
    system: systemPrompt,

    messages: await convertToModelMessages(messages),

    stopWhen: stepCountIs(5),

    onStepFinish: ({ toolCalls }) => {
      if (toolCalls?.length) {
        console.log(
          "[chat] tools used:",
          toolCalls.map((t) => `${t.toolName}(${JSON.stringify(t.input)})`).join(", "),
        );
      }
    },

    tools: {
      searchContacts: tool({
        description:
          "Search CRM contacts by name, email, or company. Returns matching contacts.",
        inputSchema: z.object({
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
        inputSchema: z.object({
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
        inputSchema: z.object({
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
        inputSchema: z.object({}),
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
        inputSchema: z.object({
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
        inputSchema: z.object({
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
        inputSchema: z.object({
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
        inputSchema: z.object({
          goal: z.string().describe("The overall goal of the session"),
          steps: z.array(
            z.object({
              type: z.enum(["crm_action", "notify", "wait", "ai_reason", "human_checkpoint"]).describe("Step type"),
              description: z.string().describe("What this step does"),
              config: z.record(z.string(), z.unknown()).optional().describe("Step-specific config (e.g. { duration: '3d' } for wait, { action: 'create_activity' } for crm_action)"),
            }),
          ).describe("The ordered list of steps in the plan"),
        }),
      }),

      getSessionStatus: tool({
        description:
          "Get the current status of an agent session, including goal, progress, and recent events.",
        inputSchema: z.object({
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
          "STRICT lookup by exact SKU code or exact category name. Do NOT use this for natural-language queries, ingredient names, symptoms, or recommendations — use search_products_similar instead. Only use when the user provides a specific SKU (numeric code) or literal category filter.",
        inputSchema: z.object({
          query: z.string().optional().describe("Exact SKU code only (e.g. '210000046')"),
          category: z.string().optional().describe("Exact category name to filter by"),
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

      search_products_similar: tool({
        description:
          "PRIMARY product search tool. Uses pgvector semantic search over the product catalog. Use for ALL product discovery queries: recommendations, ingredient names (diclofenaco, ibuprofeno, bicarbonato, etc.), symptoms, use-cases, brand names, families, or any natural-language query. Handles Spanish and English. Prefer this over searchProducts unless the user gave an exact SKU code.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Natural-language product query (e.g. 'analgésico para dolor de cabeza', 'gotas para ojos secos', 'antiinflamatorio')",
            ),
          limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
        }),
        execute: async ({ query, limit }) => {
          const { embedding } = await embed({
            model: openai.embedding("text-embedding-3-small"),
            value: query,
          });

          const vectorLiteral = `[${embedding.join(",")}]`;
          const result = await db.execute(sql`
            SELECT id, name, sku, brand, type, category, family_name, group_name,
                   min_price, price, currency, available, approved, image_url,
                   embedding <=> ${vectorLiteral}::vector AS distance
            FROM products
            WHERE active = true
              AND embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT ${limit ?? 10}
          `);

          return { query, count: result.rows.length, results: result.rows };
        },
      }),

      getOrderHistory: tool({
        description:
          "Get order history for a contact. Returns their recent orders with items.",
        inputSchema: z.object({
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
          "Recommend products for a CONTACT or ACCOUNT based on their order history. Uses pgvector centroid of past purchases (with text-profile fallback) + LLM rerank with reasoning. Pass exactly one of contactId or accountId. Already-purchased products are automatically excluded.",
        inputSchema: z.object({
          contactId: z.string().uuid().optional().describe("Recommend for an individual contact"),
          accountId: z.string().uuid().optional().describe("Recommend for a whole account/company (aggregates all its orders)"),
          limit: z.number().int().min(1).max(20).optional().describe("Max suggestions (default 5)"),
        }),
        execute: async ({ contactId, accountId, limit: maxSuggestions }) => {
          const NIL_UUID = "00000000-0000-0000-0000-000000000000";
          
          // Reject nil UUIDs; if contactId is nil/empty, use only accountId
          if (contactId?.toLowerCase() === NIL_UUID || !contactId) {
            contactId = undefined;
          }
          if (accountId?.toLowerCase() === NIL_UUID || !accountId) {
            accountId = undefined;
          }
          
          if (!contactId && !accountId) {
            return { error: "No valid contact or account selected" };
          }
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100"}/api/orders/suggest`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId, accountId, limit: maxSuggestions, locale }),
            },
          );
          if (!res.ok) {
            const errorBody = await res.text();
            return { error: `Failed to get suggestions: ${res.status}` };
          }
          return await res.json();
        },
      }),

      crossSellFromPeers: tool({
        description:
          "COLLABORATIVE cross-sell: find products that ACCOUNTS SIMILAR to this one bought, that this account hasn't yet. Uses purchase-vector centroid to identify peer accounts, then aggregates their purchases. Use when the user asks about 'peers', 'similar accounts', 'other customers like this one', or 'cross-sell ideas based on what comparable accounts buy'. For own-history-based recommendations use suggestProducts instead. Pass exactly one of accountId or contactId (a contactId is resolved to its account).",
        inputSchema: z.object({
          accountId: z.string().uuid().optional().describe("Subject account UUID"),
          contactId: z.string().uuid().optional().describe("Contact UUID — internally resolved to its accountId"),
          limit: z.number().int().min(1).max(20).optional().describe("Max suggestions (default 5)"),
          peerCount: z.number().int().min(3).max(50).optional().describe("How many peer accounts to consider (default 10)"),
        }),
        execute: async ({ accountId, contactId, limit: maxSuggestions, peerCount }) => {
          const NIL_UUID = "00000000-0000-0000-0000-000000000000";
          
          // Reject nil UUIDs; if contactId is nil/empty, use only accountId
          if (contactId?.toLowerCase() === NIL_UUID || !contactId) {
            contactId = undefined;
          }
          if (accountId?.toLowerCase() === NIL_UUID || !accountId) {
            accountId = undefined;
          }
          
          if (!accountId && !contactId) {
            return { error: "No valid account or contact selected" };
          }
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100"}/api/orders/cross-sell`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accountId,
                contactId,
                limit: maxSuggestions,
                peerCount,
                locale,
              }),
            },
          );
          if (!res.ok) {
            return { error: `Failed to get peer cross-sell: ${res.status}` };
          }
          return await res.json();
        },
      }),

      previewCreateOrder: tool({
        description:
          "Preview creating a new order. Call this immediately when the user wants to create an order — the form lets them fill in details. Do NOT ask for fields first.",
        inputSchema: z.object({
          contactId: z.string().uuid().optional().describe("Contact ID for the order"),
          items: z.array(z.object({
            productId: z.string().uuid().describe("Product ID"),
            quantity: z.number().min(1).describe("Quantity"),
          })).optional().describe("Order line items"),
          notes: z.string().optional().describe("Order notes"),
        }),
      }),

      previewUpdateOrderStatus: tool({
        description:
          "Preview updating an order's status. Order status flow: draft → confirmed → shipped → delivered. Any non-terminal status can also go to cancelled. Call this when the user wants to change an order's status (confirm, ship, deliver, or cancel an order). The user will confirm the change.",
        inputSchema: z.object({
          orderId: z.string().uuid().describe("The order ID to update"),
          orderNumber: z.string().describe("The order number for display (e.g. ORD-0018)"),
          currentStatus: z.string().describe("Current order status for display"),
          newStatus: z.enum(["confirmed", "shipped", "delivered", "cancelled"]).describe("The target status"),
        }),
      }),

      getOrderStatus: tool({
        description:
          "Get the current status and details of a specific order.",
        inputSchema: z.object({
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

    onFinish: async ({ text, usage, toolCalls }) => {
      if (toolCalls?.length) {
        console.log("[chat] tool calls in this conversation:", toolCalls.map((c) => c.toolName));
      }

      console.log(`[chat] usage for this response: inputTokens=${usage?.inputTokens} outputTokens=${usage?.outputTokens} totalTokens=${usage?.totalTokens}`);
      if (text) {
        await saveMessage(conversationId!, "assistant", text, {
          model,
          tokensIn: usage?.inputTokens,
          tokensOut: usage?.outputTokens,
        });
      }
      await touchConversation(conversationId!);
    }
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId },
    onError: (error) => {
      console.error("[api/chat] stream error:", error);

      if (process.env.NODE_ENV !== "production") {
        return error instanceof Error ? error.message : "Unknown stream error";
      }

      return "An error occurred.";
    },
  });
}
