---
name: agent-tool-design
description: 'Use when adding, modifying, or debugging AI SDK tools in the chat route — including tool registration, descriptions, system prompt steering, tool-vs-tool disambiguation (e.g. semantic vs keyword search), preview/write tools with confirmation forms, and rendering tool results in the chat UI.'
---

# Agent Tool Design Skill

Conventions for designing, registering, and rendering AI SDK `tool({...})` calls in this CRM chat agent.

## Stack

- **AI SDK v5** (`ai`, `@ai-sdk/openai`) — `streamText({ tools: { ... }, stopWhen: stepCountIs(N) })`
- **Zod v4** for `inputSchema`
- **Web surface**: [apps/web/app/api/chat/route.ts](apps/web/app/api/chat/route.ts) — registers tools for the user-facing chat
- **Background surface**: [packages/agent-worker/src/skill-loader.ts](packages/agent-worker/src/skill-loader.ts) — registers tools for autonomous BullMQ session jobs
- **Renderer**: [apps/web/app/components/chat/tool-invocation-renderer.tsx](apps/web/app/components/chat/tool-invocation-renderer.tsx) — maps `toolName` → React card

**Each surface registers its own tool list independently.** A tool defined only in `skill-loader.ts` is NOT callable from the web chat. Always register in the route the user will hit.

## Tool taxonomy

| Pattern | Naming | Purpose | UI |
|---|---|---|---|
| **Read tool** | camelCase verb (`searchContacts`, `getContact`) | Fetch & return data; LLM summarizes or renders | Result card in `tool-invocation-renderer.tsx` |
| **Preview/write tool** | `previewVerbNoun` (`previewCreateOrder`) | Render an interactive form; user confirms | Custom form component (e.g. `OrderFormCard`) |
| **Semantic tool** | `snake_case_with_modifier` (`search_products_similar`) | Vector / fuzzy search distinct from keyword equivalent | Hidden raw output; LLM renders via openui-lang |
| **Status tool** | `getXStatus` | Check progress of a background job/session | Status card |

Mixing snake_case and camelCase is intentional — it visually separates classes of tools to the LLM and to humans reading logs.

## Registration template

```ts
toolName: tool({
  description:
    "ONE-LINE purpose. WHEN to use it. WHEN NOT to use it. Disambiguate from sibling tools by name.",
  inputSchema: z.object({
    query: z.string().describe("Natural-language description with example"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
  }),
  execute: async ({ query, limit }) => {
    // ... return JSON-serializable object
    return { query, count, results };
  },
}),
```

## System prompt steering — the disambiguation problem

The LLM picks tools based on `description` text + tool name. When two tools overlap (e.g. `searchProducts` keyword vs `search_products_similar` semantic), it will default to whichever sounds more general unless you steer it explicitly.

**Pattern that works** (from [route.ts](apps/web/app/api/chat/route.ts)):

```
PRODUCT SEARCH — IMPORTANT:
- Default tool: search_products_similar (pgvector semantic search). Use it for ALL product
  discovery: recommendations, ingredient names, symptoms, brands, free-form queries.
- Only use searchProducts when the user gives an exact SKU code or strict category filter.
- When in doubt, use search_products_similar.
```

Then **narrow the loser's description** so the LLM sees it as restrictive:
```ts
searchProducts: tool({
  description:
    "STRICT lookup by exact SKU code or exact category name. Do NOT use for natural-language queries — use search_products_similar instead.",
  ...
})
```

Both signals (system prompt + tool description) together. Either one alone is unreliable.

## Diagnosing which tool fired

Add `onStepFinish` to `streamText({...})`:

```ts
onStepFinish: ({ toolCalls }) => {
  if (toolCalls?.length) {
    console.log(
      "[chat] tools used:",
      toolCalls.map((t) => `${t.toolName}(${JSON.stringify(t.input)})`).join(", "),
    );
  }
},
```

Watch the Next.js dev terminal. Browser DevTools alternative: Network tab → `/api/chat` request → **EventStream** tab (NOT Response — SSE doesn't render there).

## Rendering tool results

In [tool-invocation-renderer.tsx](apps/web/app/components/chat/tool-invocation-renderer.tsx):

- **`state === "input-streaming"`** → loader with `t("running", { toolName })`
- **`state === "input-available"`** → for `previewX` tools, render the form card (so the user can confirm BEFORE the tool executes)
- **`state === "output-available"`** → render result card OR return `null` if the LLM will render it via openui-lang (see `openui` skill)

**For tools whose results the LLM renders via openui-lang** (like `search_products_similar`), the fallback `return null` at the end of `output-available` handles it — do nothing extra. The LLM emits a text part with an ` ```openui-lang ` fence after the tool result, and `chat-message.tsx` renders it.

## Stop conditions

`stopWhen: stepCountIs(5)` — caps tool-calling loops. Increase if you have multi-step plans (e.g. agent calls `getContact` → `getOrderHistory` → `search_products_similar` → renders).

## Adding a new tool — checklist

1. **Pick the surface**: web chat (user-facing) → `route.ts`; background autonomous → `skill-loader.ts`. Often both.
2. **Pick the name**: verb-style for read, `previewX` for write, snake_case for semantic/specialty.
3. **Write the description** with explicit "use when" + "do NOT use when" if it overlaps siblings.
4. **Define `inputSchema`** with `.describe()` on every field — these become the LLM's parameter docs.
5. **Implement `execute`** — return a flat JSON-serializable shape. Don't return Drizzle row instances directly (they may have non-serializable getters); spread or pick fields.
6. **Update the system prompt** if the tool needs steering against a sibling.
7. **Add UI handling** in `tool-invocation-renderer.tsx` (or rely on the `null` fallback if openui-lang renders it).
8. **Test with `onStepFinish` logging** to confirm the LLM picks it for the expected queries.

## Recommendation flows (future, contact-centric)

For "recommend products to a contact based on order history + similar contacts":

- **`recommend_products_for_contact`** — input: `contactId`, `limit`. Internally:
  1. Build contact centroid from purchased products' embeddings (see `pgvector-embeddings` skill).
  2. Optionally union with neighbor-contact recommendations.
  3. Filter out already-purchased, out-of-stock, unapproved.
  4. Return ranked list.
- **`find_similar_contacts`** — input: `contactId`. Returns nearest contacts by purchase-vector centroid; useful for "customers like this also bought".
- **`explain_recommendation`** — input: `contactId`, `productId`. Returns features that contributed (shared category with past purchases, neighbor signal, etc.) so the LLM can produce reasoning text.

Keep these as **separate tools** rather than overloading one. The LLM composes them well, and each maps cleanly to a render card.
