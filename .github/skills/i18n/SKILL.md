---
name: i18n
description: 'Use when adding, modifying, or working with internationalized text and translations. Covers next-intl setup, message files (en.json/es.json), translation namespaces, useTranslations patterns, locale routing, and navigation helpers.'
---

# i18n Skill — next-intl Internationalization

This skill provides conventions and patterns for adding or modifying internationalized text in this project.

## Stack

- **Library**: `next-intl@4.8.3`
- **Locales**: `en`, `es` (defined in `apps/web/i18n/routing.ts`)
- **Message files**: `apps/web/messages/en.json`, `apps/web/messages/es.json`
- **Routing**: Locale prefix in URL (`/en/...`, `/es/...`), default `en`

## Architecture

```
apps/web/
├── i18n/
│   ├── routing.ts          # defineRouting({ locales, defaultLocale })
│   ├── request.ts          # getRequestConfig — loads messages per locale
│   └── navigation.ts       # createNavigation — Link, redirect, usePathname, useRouter
├── middleware.ts            # next-intl middleware for non-API routes, CORS for /api/*
├── messages/
│   ├── en.json              # English translations (flat namespaced object)
│   └── es.json              # Spanish translations (same structure)
├── app/
│   ├── layout.tsx           # Root layout (no i18n provider here)
│   └── [locale]/
│       └── layout.tsx       # NextIntlClientProvider wraps children with messages
```

## Message Namespaces

Messages are organized as a flat top-level object with namespaced keys. Current namespaces:

| Namespace | Used by | Purpose |
|-----------|---------|---------|
| `metadata` | `[locale]/layout.tsx` | Page title/description |
| `common` | Shared across components | Cancel, confirm, loading, etc. |
| `nav` | `app-sidebar.tsx` | Sidebar navigation labels |
| `chat` | `chat-panel.tsx` | Main chat UI strings |
| `aiChat` | `ai-chat-sheet.tsx`, `chat-panel.tsx` | Context-specific AI chat (deal/contact/order suggestions) |
| `conversationSidebar` | `conversation-sidebar.tsx` | Conversation list labels |
| `dealForm` | `chat/deal-form-card.tsx` | Deal creation form |
| `contactForm` | `chat/contact-form-card.tsx` | Contact creation form |
| `stageUpdate` | `chat/stage-update-card.tsx` | Deal stage move confirmation |
| `sessionPlan` | `chat/session-plan-card.tsx` | Agent session creation |
| `sessionStatus` | `chat/session-status-card.tsx` | Session status display |
| `contactList` | `chat/contact-list-card.tsx` | Contact list results |
| `contactDetail` | Contact detail page | Contact profile |
| `dealList` | `chat/deal-list-card.tsx` | Deal list results |
| `toolRenderer` | `chat/tool-invocation-renderer.tsx`, `chat-message.tsx` | Tool execution states |
| `dashboard` | Dashboard page | Dashboard overview |
| `contacts` | Contacts list page | Contacts table |
| `deals` | Deals list/board page | Deals UI |
| `pipeline` | Pipeline page | Pipeline board |
| `sessions` | Sessions list page | Session cards |
| `sessionDetail` | Session detail page | Full session view |
| `dealDetail` | Deal detail page | Deal profile |
| `products` | Products list page | Products table |
| `productDetail` | Product detail page | Product profile |
| `orders` | Orders list page | Orders table |
| `orderDetail` | Order detail page | Order profile |

## How to Add Translations

### Step 1 — Add keys to BOTH message files

Always add keys to **both** `en.json` and `es.json` simultaneously with the same structure:

```json
// en.json — add under existing or new namespace
{
  "myNamespace": {
    "title": "My Title",
    "description": "Some description with {param} interpolation"
  }
}

// es.json — same keys, translated values
{
  "myNamespace": {
    "title": "Mi Título",
    "description": "Alguna descripción con interpolación de {param}"
  }
}
```

### Step 2 — Use in components

**Client components** (most UI):
```tsx
"use client";
import { useTranslations } from "next-intl";

export function MyComponent() {
  const t = useTranslations("myNamespace");
  return <h1>{t("title")}</h1>;
}
```

**With interpolation:**
```tsx
t("description", { param: someValue })
```

**With plurals** (ICU syntax):
```json
{ "events": "{count, plural, one {# event} other {# events}}" }
```
```tsx
t("events", { count: 5 })
```

**Server components** (layouts, metadata):
```tsx
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("title") };
}
```

### Step 3 — Navigation

Use the custom navigation helpers from `@/i18n/navigation` instead of Next.js defaults:

```tsx
import { Link, useRouter, usePathname, redirect } from "@/i18n/navigation";

// Link automatically handles locale prefixing
<Link href="/contacts">Contacts</Link>
```

## Rules

1. **Never hardcode user-visible strings** — always use translation keys
2. **Always update both `en.json` and `es.json`** in the same edit
3. **Keep namespace flat** — one level of nesting only (`namespace.key`, not `namespace.sub.key`)
4. **Use existing namespaces** when adding keys to an existing feature area
5. **Create a new namespace** only when building a completely new feature/page
6. **API routes skip i18n** — the middleware excludes `/api/*` from locale processing
7. **Use `useLocale()`** from `next-intl` when you need the current locale string (e.g., for API calls)
8. **Pass `locale` to API calls** when the backend needs to return localized content (e.g., the chat route receives `locale` in the body)
