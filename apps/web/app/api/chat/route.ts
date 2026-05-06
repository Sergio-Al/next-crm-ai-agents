import { NextRequest } from "next/server";
import { streamText, tool, stepCountIs, convertToModelMessages, embed, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from 'zod';
import { readFileSync } from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { sql, eq, and, desc, asc } from "drizzle-orm";
import * as schema from "@crm-agent/shared/db/schema";
import { loadDynamicTools } from "@/lib/tools/dynamic-loader";
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

const CRM_INSTRUCTIONS = `You are a CRM assistant for Acme Corp. You help users manage contacts, accounts, deals, the sales pipeline, products, and orders.

You have access to tools that interact with the CRM database. Use them when the user asks about contacts, accounts, deals, pipeline, products, or orders.

For READ operations (searching, viewing), use the tools directly — results will be shown to the user immediately.

For WRITE operations (creating contacts, creating deals, updating deal stages, creating orders, updating order status, logging activities), ALWAYS call the preview tools immediately (previewCreateContact, previewCreateDeal, previewUpdateDealStage, previewCreateOrder, previewUpdateOrderStatus, previewLogActivity). These render rich interactive forms with contact search, stage dropdowns, and validation — the user can fill in any missing fields directly in the form. NEVER generate openui-lang Form components for CRM write operations. Do NOT say you've created something — the user will confirm via the form.

CRITICAL: When the user asks to create a contact, deal, order, log an activity, or update a stage, call the appropriate preview tool RIGHT AWAY. Do NOT ask the user for details first. Do NOT list what information you need. Just call the tool immediately with whatever information you have (even if it's nothing) — the form handles the rest. For example, if the user says "create a new deal", call previewCreateDeal immediately with an empty title. If the user says "log a call with Jane about the renewal", call previewLogActivity immediately with type="call" and whatever subject/contact info you can infer. Never respond with text asking for fields.

When the user asks about product suggestions or what to recommend for a contact OR account, use the suggestProducts tool. Pass contactId for an individual person, OR accountId for a company-level recommendation (aggregates all that account's orders). It uses pgvector centroid search over the contact/account's purchase history, excluding already-purchased products, and reranks with reasoning.

CRITICAL: NEVER pass the same UUID for both contactId and accountId — they are different entities. When the active context is an account, pass ONLY accountId. When the active context is a contact, pass ONLY contactId (the system will resolve the account internally). The same rule applies to crossSellFromPeers.

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

ACCOUNTS — IMPORTANT (read all four rules before picking a tool):
- Use **searchAccounts** (keyword) when the user gives a name, SAP ID, domain, or industry to filter by — e.g. "find accounts named 10 de mayo", "cuentas en industria farmacia", or lists without description. All inputs are optional; call searchAccounts({}) for the most recently-synced accounts.
- Use **search_accounts_similar** (pgvector semantic) when the user describes an account in natural language without naming it — e.g. "farmacias rurales en Santa Cruz", "cuentas de tipo mayorista con condición contado", "accounts similar to this profile", "clientes del mismo segmento que esta cuenta". Also use it for **any location/zone/city/neighborhood query** — e.g. "clientes de montero santa cruz", "cuentas en la zona de sopocachi", "clientes del norte de la paz", "cuentas de cochabamba". Do NOT use searchAccounts for these.
- Use **find_similar_accounts** when the user asks for accounts similar to a SPECIFIC account they already know — e.g. "accounts like this one", "cuentas parecidas a esta", "find me 5 customers with a similar profile to this account". Pass the known accountId. The result also feeds crossSellFromPeers and suggestProducts at the account level.
- Use **getAccount** for a full 360° view: account record, contacts, deals, order stats (count + revenue + last order), and recent orders — all in one call.
- Use **getTopAccountsByOrders** when the user asks for ranked lists like "accounts with the most orders", "top accounts by order volume", "biggest customers by revenue", "cuentas con más pedidos". Pass sortBy='revenue' for revenue-based ranking, status='confirmed' to exclude drafts/cancelled. Pass **city** when the user mentions a city (e.g. "en Cochabamba" → city: "Cochabamba", "en La Paz" → city: "La Paz"). Pass **zone** for zona_ventas. ONLY pass createdAfter/createdBefore when the user explicitly requests a date window.
- After getAccount returns an accountId, use it directly with suggestProducts({ accountId }) or crossSellFromPeers({ accountId }) — no extra lookup needed.
- For suggestProducts and crossSellFromPeers pass only accountId when working at the account level. Only pass contactId when you have a real, known contact UUID for that specific contact.
- CDC-synced accounts have updatedAt bumped on each sync. Use the updatedAfter filter to find recently-synced accounts (e.g. "accounts synced today").

CONTACTS:
- Use **searchContacts** to list or find contacts.
- Use **getContact** for a detailed contact view when the user asks about one specific person.

CHAT ENTITY LINKS:
- When you know an exact accountId or contactId and want the user to inspect that record from chat, prefer an openui-lang button or list item with **@OpenUrl** pointing at an INTERNAL chat URL.
- Internal chat URL format: \`/chat?id={conversationId}&drawerType=account&drawerId={accountId}\` or \`/chat?id={conversationId}&drawerType=contact&drawerId={contactId}\`.
- Only emit these internal drawer URLs when you know the exact UUID. Never invent IDs.
- Prefer clickable account/contact references after searchAccounts, searchContacts, getAccount, or getContact when the user is choosing or drilling into a specific record.
- If the entity is ambiguous, ask a clarifying question instead of emitting uncertain links.
- Do NOT use markdown inline links for CRM entity navigation. Use openui-lang buttons or list items with @OpenUrl.
- External websites, such as account.website, should still use normal external URLs.

ORDER ANOMALIES:
- Use **detectOrderAnomalies** when the user asks about stuck, delayed, overdue, or problem orders ("órdenes atrasadas", "pedidos bloqueados", "errores SAP", "entregas retrasadas", "compromisos vencidos", etc.).
- Returns 4 anomaly types: overdue_delivery (fecha_entrega passed), overdue_commitment (fecha_compromiso_c passed, not yet delivered), stuck_confirmed (confirmed >7d, no shipment), sap_error.
- Use the **city** param to scope geographically — e.g. "pedidos atrasadas en La Paz" → city: "La Paz", "entregas en riesgo en Santa Cruz" → city: "Santa Cruz".
- Use the **zone** param for zona_ventas filters — e.g. "pedidos bloqueados en zona sur" → zone: "zona sur".
- After surfacing anomalies, propose a follow-up: suggest logging an activity with previewLogActivity or creating a new agent session.

OPERATIONAL INTELLIGENCE:
- Use **analyzeRepurchaseGap** when the user asks about customers who bought a product but haven't reordered — e.g. "clientes que compraron ibuprofeno pero no han vuelto a comprar en la última semana", "who bought X but hasn't reordered in 30 days", "compradores de paracetamol sin recompra". Pass the product name and optional gap days. Pass **city** or **zone** when the user mentions a location (e.g. "en cochabamba" → city: "Cochabamba").
- Use **prioritizeVisits** when the user asks who to visit, which customers need attention, or wants a ranked visit list — e.g. "a quién debería visitar hoy", "prioriza mis clientes", "cuáles cuentas necesitan atención", "who should I call today". Optionally pass city or zone to scope geographically.
- Use **analyzeRepurchaseProbability** when the user asks about repurchase likelihood, churn risk, or who is likely to order again — e.g. "clientes con mayor posibilidad de recompra", "quiénes van a volver a comprar", "clientes en riesgo de no recomprar". Returns accounts ranked by RFM score with breakdown.
- Use **previewRescheduleDeliveries** when the user wants to bulk-reschedule deliveries for a date — e.g. "reprograma las entregas de hoy para mañana", "move today's deliveries to next week", "postpone deliveries for [date]". The form shows affected orders for confirmation before executing.

SMART ORDER CREATION:
- For smart order creation from an account, call previewCreateOrder({ accountId, contactId }) — do NOT attempt to include suggestedItems by recalling product IDs from prior tool results. Product UUIDs are long internal identifiers that cannot be reliably reproduced from context; the form lets the user select products.
- Only pass suggestedItems when a prior tool explicitly returned a list with productId values (e.g., recentOrders items from getAccount).
- Resolve contactId from the account's contacts list (first contact) before calling previewCreateOrder. If the account has no contacts, OMIT contactId entirely. NEVER pass the same UUID for both contactId and accountId — they are different entities.
- OMIT optional fields (dealId, contactId, items, suggestedItems) entirely when you don't have real values. Do NOT pass empty strings, empty arrays, or nil/zero UUIDs (e.g. "00000000-..."). Use undefined/leave the field out.

Be concise and helpful. Format monetary values with currency symbols.`;

function buildSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: process.env.TZ ?? "America/La_Paz",
  });
  const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${OPENUI_PROMPT}

---

Today is ${dateStr} (${isoDate}). Use this when the user refers to "today", "tomorrow", "this week", or any relative date.

${CRM_INSTRUCTIONS}`;
}

/**
 * Strip orphan tool calls (tool-input parts whose tool result was never
 * submitted) from the message history, plus any messages that become empty
 * as a result. This avoids `AI_MissingToolResultsError` when a user reloads
 * a conversation that had an abandoned HITL form (e.g. previewCreateOrder).
 */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  const cleaned = messages.map((msg) => {
    if (!Array.isArray(msg.parts)) return msg;
    const parts = msg.parts.filter((p: any) => {
      const type: string | undefined = p?.type;
      if (typeof type !== "string") return true;
      // AI SDK v5 tool parts: type === `tool-${toolName}`. State of `output-available`
      // means the result was provided. Drop any other state (input-streaming /
      // input-available) — those are dangling tool calls.
      if (type.startsWith("tool-")) {
        return p.state === "output-available";
      }
      return true;
    });
    return { ...msg, parts } as UIMessage;
  });
  // Drop messages that have no parts left after sanitization.
  return cleaned.filter((m) => Array.isArray(m.parts) && m.parts.length > 0);
}

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

  const SYSTEM_PROMPT = buildSystemPrompt();
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

  // Load registry tools (HTTP integrations added by admins) and append their
  // system-prompt hints so the LLM knows how to use them.
  const dynamic = await loadDynamicTools(null);
  if (dynamic.hints.length > 0) {
    systemPrompt += `\n\n## Custom Tools\n${dynamic.hints.join("\n")}`;
  }

  const result = streamText({
    model: openai(model),
    system: systemPrompt,

    messages: await convertToModelMessages(sanitizeMessages(messages)),

    stopWhen: stepCountIs(8),

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
          "Search, filter, or list CRM contacts. All inputs are optional — when no query/filters are given, returns the most recent contacts. Use sortBy='recent' for 'latest contacts', 'oldest' for first-created, 'name' for alphabetical. Use filters (hasEmail, source, createdAfter, createdBefore) to narrow further. Always returns a `contacts` array with id, name, email, phone, company, source, tags, createdAt.",
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe(
              "Optional search term matched against name, email, or company (ILIKE). Omit to list all.",
            ),
          sortBy: z
            .enum(["recent", "oldest", "name"])
            .optional()
            .describe(
              "Sort order. 'recent' = newest createdAt first (default when no query). 'oldest' = first created. 'name' = alphabetical by lastName, firstName.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max results to return (default 10, max 50)."),
          hasEmail: z
            .boolean()
            .optional()
            .describe("If true, only contacts with a non-empty email."),
          source: z
            .string()
            .optional()
            .describe("Filter by lead source (exact match, case-insensitive)."),
          createdAfter: z
            .string()
            .optional()
            .describe("ISO 8601 date — only contacts created on/after this."),
          createdBefore: z
            .string()
            .optional()
            .describe("ISO 8601 date — only contacts created on/before this."),
        }),
        execute: async ({
          query,
          sortBy,
          limit,
          hasEmail,
          source,
          createdAfter,
          createdBefore,
        }) => {
          const conditions = [] as Array<ReturnType<typeof sql>>;

          if (query && query.trim().length > 0) {
            const q = `%${query.trim()}%`;
            conditions.push(sql`(
              ${schema.contacts.firstName} ilike ${q} or
              ${schema.contacts.lastName} ilike ${q} or
              (${schema.contacts.firstName} || ' ' || ${schema.contacts.lastName}) ilike ${q} or
              ${schema.contacts.email} ilike ${q} or
              ${schema.contacts.companyName} ilike ${q}
            )`);
          }
          if (hasEmail) {
            conditions.push(
              sql`${schema.contacts.email} is not null and ${schema.contacts.email} <> ''`,
            );
          }
          if (source) {
            conditions.push(sql`${schema.contacts.source} ilike ${source}`);
          }
          if (createdAfter) {
            conditions.push(sql`${schema.contacts.createdAt} >= ${createdAfter}`);
          }
          if (createdBefore) {
            conditions.push(sql`${schema.contacts.createdAt} <= ${createdBefore}`);
          }

          const where =
            conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;

          // Default sort: 'recent' if no query (browse mode), else by relevance (createdAt desc as fallback)
          const effectiveSort = sortBy ?? "recent";
          const orderBy =
            effectiveSort === "oldest"
              ? asc(schema.contacts.createdAt)
              : effectiveSort === "name"
                ? sql`${schema.contacts.lastName} asc nulls last, ${schema.contacts.firstName} asc nulls last`
                : desc(schema.contacts.createdAt);

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
              createdAt: schema.contacts.createdAt,
            })
            .from(schema.contacts)
            .where(where)
            .orderBy(orderBy)
            .limit(limit ?? 10);

          return {
            contacts: rows,
            total: rows.length,
            sortBy: effectiveSort,
          };
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

      searchAccounts: tool({
        description:
          "Search, filter, or list CRM accounts (companies). The query is matched case-insensitively against name/domain/industry/sapAccountId; if no exact ILIKE matches, a trigram-similarity fallback runs so typos and partial/reordered words still find the right account (e.g. 'mayo scz' → '10 DE MAYO-SCZ'). When `fuzzy: true` is in the result, ALWAYS confirm the chosen account with the user before continuing. All inputs are optional — when no query/filters are given, returns the most recently updated accounts. Use sortBy='recent' for 'latest accounts' (default), 'oldest' for first-created, 'name' for alphabetical.",
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe(
              "Optional search term matched against name, domain, industry, or sapAccountId (ILIKE). Omit to list all.",
            ),
          sortBy: z
            .enum(["recent", "oldest", "name"])
            .optional()
            .describe(
              "Sort order. 'recent' = newest updatedAt first (default — best for CDC-synced accounts). 'oldest' = first created. 'name' = alphabetical.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max results to return (default 10, max 50)."),
          industry: z
            .string()
            .optional()
            .describe("Filter by industry (case-insensitive ILIKE)."),
          hasWebsite: z
            .boolean()
            .optional()
            .describe("If true, only accounts with a non-empty website."),
          createdAfter: z
            .string()
            .optional()
            .describe("ISO 8601 date — only accounts created on/after this."),
          createdBefore: z
            .string()
            .optional()
            .describe("ISO 8601 date — only accounts created on/before this."),
          updatedAfter: z
            .string()
            .optional()
            .describe(
              "ISO 8601 date — only accounts updated/synced on/after this. Useful for finding recently CDC-synced accounts.",
            ),
        }),
        execute: async ({
          query,
          sortBy,
          limit,
          industry,
          hasWebsite,
          createdAfter,
          createdBefore,
          updatedAfter,
        }) => {
          const conditions = [] as Array<ReturnType<typeof sql>>;

          if (query && query.trim().length > 0) {
            const q = `%${query.trim()}%`;
            conditions.push(sql`(
              ${schema.crmAccounts.name} ilike ${q} or
              ${schema.crmAccounts.domain} ilike ${q} or
              ${schema.crmAccounts.industry} ilike ${q} or
              ${schema.crmAccounts.sapAccountId} ilike ${q}
            )`);
          }
          if (industry) {
            conditions.push(sql`${schema.crmAccounts.industry} ilike ${industry}`);
          }
          if (hasWebsite) {
            conditions.push(
              sql`${schema.crmAccounts.website} is not null and ${schema.crmAccounts.website} <> ''`,
            );
          }
          if (createdAfter) {
            conditions.push(sql`${schema.crmAccounts.createdAt} >= ${createdAfter}`);
          }
          if (createdBefore) {
            conditions.push(sql`${schema.crmAccounts.createdAt} <= ${createdBefore}`);
          }
          if (updatedAfter) {
            conditions.push(sql`${schema.crmAccounts.updatedAt} >= ${updatedAfter}`);
          }

          const where =
            conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;

          const effectiveSort = sortBy ?? "recent";
          const orderBy =
            effectiveSort === "oldest"
              ? asc(schema.crmAccounts.createdAt)
              : effectiveSort === "name"
                ? sql`${schema.crmAccounts.name} asc nulls last`
                : desc(schema.crmAccounts.updatedAt);

          const rows = await db
            .select({
              id: schema.crmAccounts.id,
              name: schema.crmAccounts.name,
              domain: schema.crmAccounts.domain,
              industry: schema.crmAccounts.industry,
              size: schema.crmAccounts.size,
              website: schema.crmAccounts.website,
              sapAccountId: schema.crmAccounts.sapAccountId,
              tags: schema.crmAccounts.tags,
              createdAt: schema.crmAccounts.createdAt,
              updatedAt: schema.crmAccounts.updatedAt,
            })
            .from(schema.crmAccounts)
            .where(where)
            .orderBy(orderBy)
            .limit(limit ?? 10);

          // Fuzzy fallback: when a query was provided but ILIKE found nothing,
          // run a trigram-similarity search so typos / wrong word order still
          // match (e.g. "10 mayo scz" → "10 DE MAYO-SCZ").
          if (rows.length === 0 && query && query.trim().length >= 3) {
            const q = query.trim();
            const otherConditions = conditions.slice(1); // drop the original ILIKE block
            const fuzzyConditions = [
              sql`(
                similarity(${schema.crmAccounts.name}, ${q}) > 0.2
                or similarity(coalesce(${schema.crmAccounts.domain}, ''), ${q}) > 0.3
              )`,
              ...otherConditions,
            ];
            const fuzzyWhere = sql.join(fuzzyConditions, sql` and `);
            const fuzzyRows = await db
              .select({
                id: schema.crmAccounts.id,
                name: schema.crmAccounts.name,
                domain: schema.crmAccounts.domain,
                industry: schema.crmAccounts.industry,
                size: schema.crmAccounts.size,
                website: schema.crmAccounts.website,
                sapAccountId: schema.crmAccounts.sapAccountId,
                tags: schema.crmAccounts.tags,
                createdAt: schema.crmAccounts.createdAt,
                updatedAt: schema.crmAccounts.updatedAt,
                _score: sql<number>`similarity(${schema.crmAccounts.name}, ${q})`,
              })
              .from(schema.crmAccounts)
              .where(fuzzyWhere)
              .orderBy(sql`similarity(${schema.crmAccounts.name}, ${q}) desc`)
              .limit(limit ?? 10);

            return {
              accounts: fuzzyRows.map(({ _score, ...r }) => r),
              total: fuzzyRows.length,
              sortBy: "similarity",
              fuzzy: true,
            };
          }

          return {
            accounts: rows,
            total: rows.length,
            sortBy: effectiveSort,
          };
        },
      }),

      getAccount: tool({
        description:
          "Get a full 360° view of a CRM account: account record, contacts, deals, order stats (count + revenue + last order), and recent orders. Use this whenever the user asks about a specific account/company. The returned `accountId` can be used directly with suggestProducts or crossSellFromPeers.",
        inputSchema: z.object({
          accountId: z.string().uuid().describe("The account ID"),
        }),
        execute: async ({ accountId }) => {
          const account = await db.query.crmAccounts.findFirst({
            where: eq(schema.crmAccounts.id, accountId),
          });
          if (!account) return { error: "Account not found" };

          const [contacts, deals, orderStats, recentOrders] = await Promise.all([
            db
              .select({
                id: schema.contacts.id,
                firstName: schema.contacts.firstName,
                lastName: schema.contacts.lastName,
                email: schema.contacts.email,
                phone: schema.contacts.phone,
              })
              .from(schema.contacts)
              .where(eq(schema.contacts.accountId, accountId))
              .orderBy(desc(schema.contacts.createdAt))
              .limit(20),
            db
              .select({
                id: schema.deals.id,
                title: schema.deals.title,
                value: schema.deals.value,
                currency: schema.deals.currency,
                status: schema.deals.status,
                stageName: schema.pipelineStages.name,
              })
              .from(schema.deals)
              .leftJoin(
                schema.pipelineStages,
                eq(schema.deals.stageId, schema.pipelineStages.id),
              )
              .where(eq(schema.deals.accountId, accountId))
              .orderBy(desc(schema.deals.createdAt)),
            db
              .select({
                total: sql<number>`count(*)::int`,
                confirmedCount: sql<number>`count(*) filter (where ${schema.orders.status} = 'confirmed')::int`,
                totalRevenue: sql<string>`coalesce(sum(${schema.orders.totalAmount}) filter (where ${schema.orders.status} = 'confirmed'), 0)::text`,
                lastOrderAt: sql<string | null>`max(${schema.orders.createdAt})::text`,
              })
              .from(schema.orders)
              .where(eq(schema.orders.accountId, accountId))
              .then((r) => r[0]),
            db
              .select({
                id: schema.orders.id,
                number: schema.orders.number,
                status: schema.orders.status,
                totalAmount: schema.orders.totalAmount,
                currency: schema.orders.currency,
                createdAt: schema.orders.createdAt,
              })
              .from(schema.orders)
              .where(eq(schema.orders.accountId, accountId))
              .orderBy(desc(schema.orders.createdAt))
              .limit(5),
          ]);

          return { account, contacts, deals, orderStats, recentOrders };
        },
      }),

      getTopAccountsByOrders: tool({
        description:
          "Rank accounts by order volume. Returns the top accounts ordered by order count (or by total revenue when sortBy='revenue'), with order count, confirmed-order count, total revenue, and last order date. Use this when the user asks 'which accounts have the most orders', 'top accounts by order volume', 'biggest customers', 'cuentas con más pedidos', etc. Optional date filters scope results to orders within a window.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max accounts to return (default 10, max 50)."),
          sortBy: z
            .enum(["orders", "revenue"])
            .optional()
            .describe(
              "Ranking metric. 'orders' = order count (default). 'revenue' = sum of confirmed totalAmount.",
            ),
          status: z
            .enum(["any", "confirmed"])
            .optional()
            .describe(
              "Which orders to count. 'any' = all orders (default). 'confirmed' = only orders that reached confirmed/shipped/delivered.",
            ),
          createdAfter: z
            .string()
            .optional()
            .describe(
              "ISO 8601 — only count orders created on/after this date. Omit unless the user explicitly requested a start date.",
            ),
          createdBefore: z
            .string()
            .optional()
            .describe(
              "ISO 8601 — only count orders created on/before this date. Omit unless the user explicitly requested an end date.",
            ),
          minOrders: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Only return accounts with at least this many matching orders."),
          city: z
            .string()
            .optional()
            .describe("Filter accounts to those in this city (ILIKE on custom_fields city, e.g. 'Cochabamba')."),
          zone: z
            .string()
            .optional()
            .describe("Filter accounts by zona_ventas substring (e.g. 'zona sur')."),
        }),
        execute: async ({
          limit,
          sortBy,
          status,
          createdAfter,
          createdBefore,
          minOrders,
          city,
          zone,
        }) => {
          const orderConds: ReturnType<typeof sql>[] = [];
          if (status === "confirmed") {
            orderConds.push(
              sql`${schema.orders.status} in ('confirmed','shipped','delivered')`,
            );
          }
          if (createdAfter) {
            orderConds.push(sql`${schema.orders.createdAt} >= ${createdAfter}`);
          }
          if (createdBefore) {
            orderConds.push(sql`${schema.orders.createdAt} <= ${createdBefore}`);
          }
          orderConds.push(sql`${schema.orders.accountId} is not null`);
          if (city) orderConds.push(sql`${schema.crmAccounts.customFields}->>'city' ILIKE ${'%' + city + '%'}`);
          if (zone) orderConds.push(sql`${schema.crmAccounts.zonaVentas} ILIKE ${'%' + zone + '%'}`);
          const orderWhere = sql.join(orderConds, sql` and `);

          const orderCountExpr = sql<number>`count(${schema.orders.id})::int`;
          const confirmedCountExpr = sql<number>`count(*) filter (where ${schema.orders.status} in ('confirmed','shipped','delivered'))::int`;
          const revenueExpr = sql<string>`coalesce(sum(${schema.orders.totalAmount}) filter (where ${schema.orders.status} in ('confirmed','shipped','delivered')), 0)::text`;
          const lastOrderExpr = sql<string | null>`max(${schema.orders.createdAt})::text`;

          const effectiveSort = sortBy ?? "orders";
          const orderBy =
            effectiveSort === "revenue"
              ? sql`coalesce(sum(${schema.orders.totalAmount}) filter (where ${schema.orders.status} in ('confirmed','shipped','delivered')), 0) desc`
              : sql`count(${schema.orders.id}) desc`;

          const havingClause =
            minOrders && minOrders > 1
              ? sql`count(${schema.orders.id}) >= ${minOrders}`
              : sql`count(${schema.orders.id}) > 0`;

          const rows = await db
            .select({
              id: schema.crmAccounts.id,
              name: schema.crmAccounts.name,
              industry: schema.crmAccounts.industry,
              sapAccountId: schema.crmAccounts.sapAccountId,
              city: sql<string | null>`${schema.crmAccounts.customFields}->>'city'`,
              orderCount: orderCountExpr,
              confirmedOrderCount: confirmedCountExpr,
              totalRevenue: revenueExpr,
              lastOrderAt: lastOrderExpr,
            })
            .from(schema.crmAccounts)
            .innerJoin(schema.orders, eq(schema.orders.accountId, schema.crmAccounts.id))
            .where(orderWhere)
            .groupBy(
              schema.crmAccounts.id,
              schema.crmAccounts.name,
              schema.crmAccounts.industry,
              schema.crmAccounts.sapAccountId,
            )
            .having(havingClause)
            .orderBy(orderBy)
            .limit(limit ?? 10);

          return {
            accounts: rows,
            total: rows.length,
            sortBy: effectiveSort,
            status: status ?? "any",
            city: city ?? null,
            zone: zone ?? null,
          };
        },
      }),

      search_accounts_similar: tool({
        description:
          "Semantic pgvector search over CRM accounts by natural-language profile description. Use for ANY free-form description of account characteristics: segment, type, payment terms, zone, region, industry description, or any combination — e.g. 'farmacias rurales en Santa Cruz', 'cuentas mayoristas con condición contado', 'hospital público en zona sur'. Do NOT use for known account names or SAP IDs — use searchAccounts for those.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Natural-language description of account profile (e.g. 'farmacia rural zona sur', 'mayorista con crédito limitado', 'cliente industrial en La Paz')",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max results (default 10)"),
        }),
        execute: async ({ query, limit }) => {
          const db = getDb();
          const { embedding } = await embed({
            model: openai.embedding("text-embedding-3-small"),
            value: query,
          });
          const vectorLiteral = `[${embedding.join(",")}]`;
          const result = await db.execute(sql`
            SELECT
              id, name, domain, industry, size, website,
              nombre_comercial, tipo_cuenta, categoria_ventas,
              condicion_pago, zona_ventas, id_regional,
              sap_account_id, tags, updated_at,
              embedding <=> ${vectorLiteral}::vector AS distance
            FROM crm_accounts
            WHERE embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT ${limit ?? 10}
          `);
          return { query, count: result.rows.length, results: result.rows };
        },
      }),

      find_similar_accounts: tool({
        description:
          "Find CRM accounts with a similar business profile to a KNOWN account, using pgvector cosine similarity on the account embedding. Use when the user refers to a specific account they already have in context and asks for 'similar', 'parecidas', 'like this one', 'comparable accounts', etc. Returns nearest neighbours sorted by similarity. The returned accountIds can be passed directly to suggestProducts or crossSellFromPeers.",
        inputSchema: z.object({
          accountId: z
            .string()
            .uuid()
            .describe("The reference account ID to find neighbours for"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max similar accounts to return (default 10)"),
        }),
        execute: async ({ accountId, limit }) => {
          const db = getDb();
          const ref = await db.execute(sql`
            SELECT embedding FROM crm_accounts WHERE id = ${accountId} LIMIT 1
          `);
          const refRow = ref.rows[0] as { embedding: string | null } | undefined;
          if (!refRow?.embedding) {
            return {
              error:
                "Reference account has no embedding yet — it will be available after the next CDC sync or embedding backfill.",
            };
          }
          const result = await db.execute(sql`
            SELECT
              id, name, domain, industry, size, website,
              nombre_comercial, tipo_cuenta, categoria_ventas,
              condicion_pago, zona_ventas, id_regional,
              sap_account_id, tags,
              embedding <=> ${refRow.embedding}::vector AS distance
            FROM crm_accounts
            WHERE id <> ${accountId}
              AND embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT ${limit ?? 10}
          `);
          return {
            referenceAccountId: accountId,
            count: result.rows.length,
            similarAccounts: result.rows,
          };
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

      previewLogActivity: tool({
        description:
          "Preview logging an activity (call, email, meeting, note, or task) against a contact and/or deal. Call this immediately when the user wants to log/record an activity — the form lets them review and confirm. Do NOT ask for fields first; pass whatever you know.",
        inputSchema: z.object({
          type: z
            .enum(["call", "email", "meeting", "note", "task"])
            .optional()
            .describe("Activity type"),
          subject: z.string().optional().describe("Short subject/title"),
          body: z.string().optional().describe("Notes / body content"),
          contactId: z
            .string()
            .uuid()
            .optional()
            .describe("Contact ID this activity relates to"),
          contactName: z
            .string()
            .optional()
            .describe("Contact name for display in the form"),
          dealId: z
            .string()
            .uuid()
            .optional()
            .describe("Deal ID this activity relates to"),
          dealName: z
            .string()
            .optional()
            .describe("Deal title for display in the form"),
          scheduledAt: z
            .string()
            .optional()
            .describe("Scheduled time as ISO 8601 string"),
          durationMin: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Duration in minutes"),
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
          // Only accept RFC 4122 UUIDs with a valid version nibble (1-8).
          // The LLM sometimes fabricates ffffffff-ffff-ffff-ffff-ffffffffffff
          // or other placeholder values when no contact exists.
          const STRICT_UUID_RE =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          if (
            !contactId ||
            contactId.toLowerCase() === NIL_UUID ||
            !STRICT_UUID_RE.test(contactId)
          ) {
            contactId = undefined;
          }
          if (
            !accountId ||
            accountId.toLowerCase() === NIL_UUID ||
            !STRICT_UUID_RE.test(accountId)
          ) {
            accountId = undefined;
          }

          // If the LLM passed the same UUID for both fields it almost
          // certainly hallucinated one of them from the active account
          // context. Prefer accountId and drop contactId.
          if (contactId && accountId && contactId === accountId) {
            contactId = undefined;
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

          // Same-UUID guard (see suggestProducts for rationale).
          if (contactId && accountId && contactId === accountId) {
            contactId = undefined;
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
          "Preview creating a new order. Call this immediately when the user wants to create an order — the form lets them fill in details. Do NOT ask for fields first. Pass accountId and contactId when known. Do NOT pass suggestedItems unless a prior tool call returned the exact productId values (do not reconstruct UUIDs from memory).",
        inputSchema: z.object({
          contactId: z.string().uuid().optional().describe("Contact ID for the order"),
          accountId: z.string().uuid().optional().describe("Account ID — pre-fills the contact dropdown to this account's contacts"),
          dealId: z.string().uuid().optional().describe("Deal ID to associate the order with"),
          items: z.array(z.object({
            productId: z.string().uuid().describe("Product ID"),
            quantity: z.number().min(1).describe("Quantity"),
          })).optional().describe("Order line items (plain product IDs)"),
          suggestedItems: z.array(z.object({
            productId: z.string().describe("Product ID (UUID)"),
            productName: z.string().describe("Product name"),
            productSku: z.string().optional().describe("Product SKU"),
            unitPrice: z.number().describe("Unit price"),
            quantity: z.number().min(1).describe("Quantity"),
          })).optional().describe("AI-pre-filled line items — only pass when productId values are verbatim from a prior tool result"),
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

      detectOrderAnomalies: tool({
        description:
          "Detect stuck, overdue, or SAP-sync-error orders for a given account or contact. Anomaly types: overdue_delivery (fecha_entrega passed), overdue_commitment (fecha_compromiso passed but not delivered), stuck_confirmed (confirmed >7d with no shipment), sap_error (SAP sync failure). Optionally scope to a city or zone. After surfacing results, suggest logging an activity or creating a follow-up session.",
        inputSchema: z.object({
          accountId: z.string().uuid().optional().describe("Scope to a specific account"),
          contactId: z.string().uuid().optional().describe("Scope to a specific contact"),
          city: z.string().optional().describe("Filter to accounts in this city (matches custom_fields->>'city', e.g. 'La Paz')"),
          zone: z.string().optional().describe("Filter to accounts in this sales zone (matches zona_ventas, e.g. 'zona sur')"),
          limit: z.number().min(1).max(50).optional().describe("Max anomalies to return (default 20)"),
        }),
        execute: async ({ accountId, contactId, city, zone, limit = 20 }) => {
          const SAP_ERROR_STATES = new Set([
            "Error", "ERROR", "error", "Failed", "FAILED",
            "Rechazado", "Fallido", "Pendiente Error",
          ]);
          const STUCK_THRESHOLD_DAYS = 7;
          const OVERDUE_CRITICAL_DAYS = 14;

          type Anomaly = {
            orderId: string; orderNumber: string; accountName: string | null;
            type: "overdue_delivery" | "overdue_commitment" | "stuck_confirmed" | "sap_error";
            severity: "warning" | "critical"; detail: string; daysSince: number;
          };
          const anomalies: Anomaly[] = [];

          const baseConditions: ReturnType<typeof sql>[] = [
            sql`${schema.orders.status} = 'confirmed'`,
            sql`${schema.orders.shippedAt} IS NULL`,
          ];
          if (accountId) baseConditions.push(eq(schema.orders.accountId, accountId));
          if (contactId) baseConditions.push(eq(schema.orders.contactId, contactId));
          if (city) baseConditions.push(sql`${schema.crmAccounts.customFields}->>'city' ILIKE ${'%' + city + '%'}`);
          if (zone) baseConditions.push(sql`${schema.crmAccounts.zonaVentas} ILIKE ${'%' + zone + '%'}`);
          const baseWhere = sql.join(baseConditions, sql` AND `);

          // Overdue delivery
          const overdueRows = await db
            .select({
              id: schema.orders.id, number: schema.orders.number,
              accountName: schema.crmAccounts.name,
              fechaEntrega: schema.suiteRecoPedidos.fechaEntrega,
            })
            .from(schema.orders)
            .innerJoin(schema.suiteRecoPedidos, eq(schema.suiteRecoPedidos.orderId, schema.orders.id))
            .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
            .where(sql`${baseWhere} AND ${schema.suiteRecoPedidos.fechaEntrega} IS NOT NULL AND ${schema.suiteRecoPedidos.fechaEntrega} < NOW()`)
            .limit(limit);

          for (const r of overdueRows) {
            const d = r.fechaEntrega ? Math.floor((Date.now() - new Date(r.fechaEntrega).getTime()) / 86_400_000) : 0;
            anomalies.push({ orderId: r.id, orderNumber: r.number, accountName: r.accountName ?? null, type: "overdue_delivery", severity: d >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning", detail: `Delivery date was ${new Date(r.fechaEntrega!).toLocaleDateString()} — ${d}d overdue`, daysSince: d });
          }

          // Stuck confirmed
          const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_DAYS * 86_400_000);
          const stuckRows = await db
            .select({
              id: schema.orders.id, number: schema.orders.number,
              accountName: schema.crmAccounts.name, confirmedAt: schema.orders.confirmedAt,
            })
            .from(schema.orders)
            .leftJoin(schema.suiteRecoPedidos, eq(schema.suiteRecoPedidos.orderId, schema.orders.id))
            .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
            .where(sql`${baseWhere} AND ${schema.orders.confirmedAt} IS NOT NULL AND ${schema.orders.confirmedAt} < ${stuckThreshold.toISOString()} AND (${schema.suiteRecoPedidos.fechaEntrega} IS NULL OR ${schema.suiteRecoPedidos.fechaEntrega} >= NOW())`)
            .limit(limit);

          for (const r of stuckRows) {
            const d = r.confirmedAt ? Math.floor((Date.now() - new Date(r.confirmedAt).getTime()) / 86_400_000) : 0;
            anomalies.push({ orderId: r.id, orderNumber: r.number, accountName: r.accountName ?? null, type: "stuck_confirmed", severity: d >= 30 ? "critical" : "warning", detail: `Confirmed ${d}d ago, not yet shipped`, daysSince: d });
          }

          // SAP sync errors
          const syncRows = await db
            .select({
              id: schema.orders.id, number: schema.orders.number,
              accountName: schema.crmAccounts.name,
              estadoSync: schema.suiteRecoPedidos.estadoSync,
              updatedAt: schema.suiteRecoPedidos.updatedAt,
            })
            .from(schema.orders)
            .innerJoin(schema.suiteRecoPedidos, eq(schema.suiteRecoPedidos.orderId, schema.orders.id))
            .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
            .where(sql`${schema.suiteRecoPedidos.estadoSync} IS NOT NULL ${accountId ? sql`AND ${schema.orders.accountId} = ${accountId}` : sql``} ${contactId ? sql`AND ${schema.orders.contactId} = ${contactId}` : sql``} ${city ? sql`AND ${schema.crmAccounts.customFields}->>'city' ILIKE ${'%' + city + '%'}` : sql``} ${zone ? sql`AND ${schema.crmAccounts.zonaVentas} ILIKE ${'%' + zone + '%'}` : sql``}`)
            .limit(limit);

          for (const r of syncRows) {
            if (!r.estadoSync || !SAP_ERROR_STATES.has(r.estadoSync)) continue;
            const d = r.updatedAt ? Math.floor((Date.now() - new Date(r.updatedAt).getTime()) / 86_400_000) : 0;
            anomalies.push({ orderId: r.id, orderNumber: r.number, accountName: r.accountName ?? null, type: "sap_error", severity: "warning", detail: `SAP sync state: ${r.estadoSync}`, daysSince: d });
          }

          // Overdue commitment (fecha_compromiso_pago passed, order not yet delivered)
          const commitmentRows = await db
            .select({
              id: schema.orders.id, number: schema.orders.number,
              accountName: schema.crmAccounts.name,
              fechaCompromisoPago: schema.suiteRecoPedidos.fechaCompromisoPago,
            })
            .from(schema.orders)
            .innerJoin(schema.suiteRecoPedidos, eq(schema.suiteRecoPedidos.orderId, schema.orders.id))
            .leftJoin(schema.crmAccounts, eq(schema.orders.accountId, schema.crmAccounts.id))
            .where(sql`
              ${baseWhere}
              AND ${schema.suiteRecoPedidos.fechaCompromisoPago} IS NOT NULL
              AND ${schema.suiteRecoPedidos.fechaCompromisoPago} < NOW()
              AND ${schema.orders.deliveredAt} IS NULL
            `)
            .limit(limit);

          for (const r of commitmentRows) {
            const d = r.fechaCompromisoPago ? Math.floor((Date.now() - new Date(r.fechaCompromisoPago).getTime()) / 86_400_000) : 0;
            anomalies.push({
              orderId: r.id, orderNumber: r.number, accountName: r.accountName ?? null,
              type: "overdue_commitment",
              severity: d >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning",
              detail: `Payment commitment date was ${new Date(r.fechaCompromisoPago!).toLocaleDateString()} — ${d}d past due`,
              daysSince: d,
            });
          }

          return { anomalies };
        },
      }),

      analyzeRepurchaseGap: tool({
        description:
          "Find accounts/contacts that bought a specific product but haven't ordered again within a given number of days. Use when the user asks about lapsed buyers, no-reorder customers, or churn signals for a product — e.g. 'clientes que compraron ibuprofeno pero no han vuelto a comprar en la última semana', 'who bought X but hasn't reordered in 30 days'.",
        inputSchema: z.object({
          productQuery: z
            .string()
            .describe("Product name or ingredient to search for (ILIKE match on order_items.product_name)"),
          daysSinceLastPurchase: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Consider a customer lapsed if they have no order in the last N days (default 7)"),
          limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
          city: z
            .string()
            .optional()
            .describe("Filter accounts to this city (ILIKE on custom_fields city, e.g. 'Cochabamba')."),
          zone: z
            .string()
            .optional()
            .describe("Filter accounts by zona_ventas substring (e.g. 'zona sur')."),
        }),
        execute: async ({ productQuery, daysSinceLastPurchase = 7, limit = 20, city, zone }) => {
          const cutoff = new Date(Date.now() - daysSinceLastPurchase * 86_400_000).toISOString();
          const cityFilter = city ? sql`AND a.custom_fields->>'city' ILIKE ${'%' + city + '%'}` : sql``;
          const zoneFilter = zone ? sql`AND a.zona_ventas ILIKE ${'%' + zone + '%'}` : sql``;
          const rows = await db.execute(sql`
            SELECT
              a.id            AS account_id,
              a.name          AS account_name,
              a.sap_account_id,
              a.custom_fields->>'city' AS city,
              COUNT(DISTINCT o.id)::int AS total_purchases,
              MAX(o.created_at)         AS last_purchase_at,
              EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int AS days_since_last
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN crm_accounts a ON a.id = o.account_id
            WHERE oi.product_name ILIKE ${'%' + productQuery + '%'}
              AND o.status IN ('confirmed', 'shipped', 'delivered')
              AND NOT EXISTS (
                SELECT 1 FROM orders o2
                WHERE o2.account_id = o.account_id
                  AND o2.created_at > ${cutoff}::timestamptz
                  AND o2.status IN ('confirmed', 'shipped', 'delivered')
              )
              ${cityFilter} ${zoneFilter}
            GROUP BY a.id, a.name, a.sap_account_id, a.custom_fields
            ORDER BY days_since_last DESC
            LIMIT ${limit}
          `);
          return {
            productQuery,
            daysSinceLastPurchase,
            city: city ?? null,
            zone: zone ?? null,
            count: rows.rows.length,
            accounts: rows.rows,
          };
        },
      }),

      prioritizeVisits: tool({
        description:
          "Rank accounts by visit priority using a composite score: revenue weight, open deals, order anomalies, and recency gap. Use when the user asks 'a quién debería visitar hoy', 'prioriza clientes importantes', 'cuáles cuentas necesitan atención', 'who should I visit today'. Optionally filter by city or zone.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).optional().describe("Max accounts to return (default 15)"),
          city: z
            .string()
            .optional()
            .describe("Filter accounts by city (matches custom_fields city substring, e.g. 'La Paz')"),
          zone: z
            .string()
            .optional()
            .describe("Filter accounts by zona_ventas substring"),
          minScore: z.number().int().min(0).optional().describe("Minimum composite score to include (default 0)"),
        }),
        execute: async ({ limit = 15, city, zone, minScore = 0 }) => {
          const cityFilter = city ? sql`AND a.custom_fields->>'city' ILIKE ${'%' + city + '%'}` : sql``;
          const zoneFilter = zone ? sql`AND a.zona_ventas ILIKE ${'%' + zone + '%'}` : sql``;
          const rows = await db.execute(sql`
            WITH order_stats AS (
              SELECT
                account_id,
                COUNT(*) FILTER (WHERE status IN ('confirmed','shipped','delivered'))::int AS confirmed_count,
                COALESCE(SUM(total_amount) FILTER (WHERE status IN ('confirmed','shipped','delivered')), 0) AS total_revenue,
                MAX(created_at) AS last_order_at,
                EXTRACT(DAY FROM NOW() - MAX(created_at))::int AS days_since_last_order
              FROM orders
              WHERE account_id IS NOT NULL
              GROUP BY account_id
            ),
            deal_stats AS (
              SELECT account_id, COUNT(*)::int AS open_deals
              FROM deals
              WHERE status = 'open' AND account_id IS NOT NULL
              GROUP BY account_id
            ),
            anomaly_flags AS (
              SELECT DISTINCT o.account_id
              FROM orders o
              WHERE o.status = 'confirmed'
                AND o.shipped_at IS NULL
                AND o.confirmed_at < NOW() - INTERVAL '7 days'
            ),
            scored AS (
              SELECT
                a.id, a.name, a.sap_account_id, a.industry,
                a.zona_ventas, a.custom_fields->>'city' AS city,
                COALESCE(os.confirmed_count, 0)         AS confirmed_orders,
                COALESCE(os.total_revenue, 0)           AS total_revenue,
                os.last_order_at,
                COALESCE(os.days_since_last_order, 999) AS days_since_last_order,
                COALESCE(ds.open_deals, 0)              AS open_deals,
                CASE WHEN af.account_id IS NOT NULL THEN true ELSE false END AS has_anomaly,
                -- score components
                CASE WHEN COALESCE(os.total_revenue, 0) > 10000 THEN 3
                     WHEN COALESCE(os.total_revenue, 0) > 1000  THEN 1
                     ELSE 0 END                                         AS score_revenue,
                CASE WHEN COALESCE(ds.open_deals, 0) > 0 THEN 2 ELSE 0 END AS score_deals,
                CASE WHEN af.account_id IS NOT NULL THEN 2 ELSE 0 END   AS score_anomaly,
                CASE WHEN COALESCE(os.days_since_last_order, 999) BETWEEN 8 AND 60 THEN 1
                     WHEN COALESCE(os.days_since_last_order, 999) > 60  THEN 2
                     ELSE 0 END                                         AS score_recency
              FROM crm_accounts a
              LEFT JOIN order_stats  os ON os.account_id = a.id
              LEFT JOIN deal_stats   ds ON ds.account_id = a.id
              LEFT JOIN anomaly_flags af ON af.account_id = a.id
              WHERE true ${cityFilter} ${zoneFilter}
            )
            SELECT *,
              (score_revenue + score_deals + score_anomaly + score_recency) AS total_score
            FROM scored
            WHERE (score_revenue + score_deals + score_anomaly + score_recency) >= ${minScore}
            ORDER BY total_score DESC, days_since_last_order DESC
            LIMIT ${limit}
          `);
          return { count: rows.rows.length, accounts: rows.rows };
        },
      }),

      analyzeRepurchaseProbability: tool({
        description:
          "Rank accounts by repurchase probability using RFM scoring (Recency × Frequency × Monetary). Use when the user asks about 'clientes con mayor posibilidad de recompra', 'who is likely to reorder', 'churn risk', 'clientes que van a volver a comprar'. Returns accounts ranked by composite RFM score (max 15) with score breakdown.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).optional().describe("Max accounts to return (default 15)"),
          industry: z.string().optional().describe("Filter by industry substring"),
          city: z.string().optional().describe("Filter by city (custom_fields->>'city' substring)"),
        }),
        execute: async ({ limit = 15, industry, city }) => {
          const industryFilter = industry ? sql`AND a.industry ILIKE ${'%' + industry + '%'}` : sql``;
          const cityFilter = city ? sql`AND a.custom_fields->>'city' ILIKE ${'%' + city + '%'}` : sql``;
          const rows = await db.execute(sql`
            WITH base AS (
              SELECT
                o.account_id,
                EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int                         AS recency_days,
                COUNT(*) FILTER (WHERE o.created_at > NOW() - INTERVAL '90 days')::int   AS frequency_90d,
                COALESCE(SUM(o.total_amount) FILTER (WHERE o.status IN ('confirmed','shipped','delivered')), 0) AS monetary
              FROM orders o
              WHERE o.account_id IS NOT NULL
                AND o.status IN ('confirmed','shipped','delivered')
              GROUP BY o.account_id
            ),
            ntile_scores AS (
              SELECT
                account_id, recency_days, frequency_90d, monetary,
                -- Lower recency = better → invert with 6 - NTILE
                (6 - NTILE(5) OVER (ORDER BY recency_days  ASC))::int  AS r_score,
                NTILE(5) OVER (ORDER BY frequency_90d      ASC)::int   AS f_score,
                NTILE(5) OVER (ORDER BY monetary           ASC)::int   AS m_score
              FROM base
            )
            SELECT
              a.id, a.name, a.sap_account_id, a.industry,
              a.custom_fields->>'city' AS city,
              ns.recency_days, ns.frequency_90d, ns.monetary::text,
              ns.r_score, ns.f_score, ns.m_score,
              (ns.r_score + ns.f_score + ns.m_score) AS rfm_score
            FROM ntile_scores ns
            JOIN crm_accounts a ON a.id = ns.account_id
            WHERE true ${industryFilter} ${cityFilter}
            ORDER BY rfm_score DESC, recency_days ASC
            LIMIT ${limit}
          `);
          return { count: rows.rows.length, accounts: rows.rows };
        },
      }),

      previewRescheduleDeliveries: tool({
        description:
          "Preview rescheduling all deliveries currently scheduled for a given date to a new date. Shows affected orders for review before executing. Use when the user says 'reprograma las entregas de hoy para mañana', 'move today's deliveries to next week', 'postpone all deliveries for [date]'. The user must confirm before anything changes.",
        inputSchema: z.object({
          fromDate: z
            .string()
            .describe("ISO 8601 date of deliveries to reschedule (e.g. today's date)"),
          toDate: z
            .string()
            .describe("ISO 8601 date to reschedule deliveries to"),
          reason: z.string().optional().describe("Reason for rescheduling (shown on confirmation card)"),
        }),
      }),

      // Spread registry tools (HTTP/external integrations) at the end so that
      // any name collision is won by the hardcoded code-tools above.
      ...dynamic.tools,
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
