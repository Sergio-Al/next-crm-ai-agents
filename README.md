# CRM Agent Platform

A distributed conversational agent CRM platform built with Next.js, TimescaleDB, Redis, and AI SDK.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 8
- **Docker** & **Docker Compose**

## Project Structure

```
apps/
  web/             → Next.js 15 dashboard (port 3100)
    i18n/            → next-intl routing, request config, navigation
    messages/        → Translation files (en.json, es.json)
    middleware.ts    → Locale detection & redirect
packages/
  shared/          → Drizzle ORM schema, DB utilities, shared types
  gateway/         → WebSocket gateway
  agent-worker/    → BullMQ agent worker
  channel-adapters/→ Channel adapter layer
infra/
  docker-compose.yml → TimescaleDB, PgBouncer, Redis
scripts/
  seed.ts          → Demo data seeder
```

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your API key(s):

```env
OPENAI_API_KEY=sk-...
```

The database and Redis defaults work out of the box with the Docker Compose setup.

### 3. Start infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d postgres pgbouncer redis
```

This starts:
- **TimescaleDB** (PostgreSQL 16) on port `5432`
- **PgBouncer** (connection pooler) on port `6432`
- **Redis** on port `6379`

### 4. Push database schema

```bash
pnpm db:push
```

### 5. Seed demo data

```bash
pnpm seed
```

Seeds the database with a workspace, user, 5 accounts, 20 contacts, 8 leads, a pipeline with 5 stages, and 15 deals.

### 6. Run the web app

```bash
pnpm --filter @crm-agent/web dev
```

Open [http://localhost:3100](http://localhost:3100). You'll be redirected to `/en/dashboard` (or your browser's preferred locale).

### 7. Start the agent worker

In a separate terminal, start the BullMQ agent worker that processes session steps:

```bash
pnpm --filter @crm-agent/agent-worker dev
```

This is required for Agent Sessions to execute (follow-up sequences, reminders, nurture campaigns, etc.). The web app works without it, but sessions will remain queued and won't progress.

## Available Scripts

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm seed` | Seed the database with demo data |
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Stopping Infrastructure

```bash
docker compose -f infra/docker-compose.yml down
```

Add `-v` to also remove data volumes.

---

## Internationalization (i18n)

The app is fully internationalized using [next-intl](https://next-intl.dev/) with URL-prefix routing.

### Supported Locales

| Locale | Language | URL prefix |
|---|---|---|
| `en` | English (default) | `/en/...` |
| `es` | Spanish | `/es/...` |

### How It Works

- **URL-prefix routing** — Each locale has its own URL prefix (e.g. `/en/dashboard`, `/es/dashboard`). The middleware detects the browser's preferred language and redirects accordingly.
- **Translation files** — All UI strings live in `apps/web/messages/en.json` and `apps/web/messages/es.json`, organized by namespace (nav, chat, dashboard, contacts, deals, pipeline, sessions, etc.).
- **Locale-aware navigation** — Internal links use `Link`, `useRouter`, and `usePathname` from `@/i18n/navigation` to preserve the current locale across navigations.
- **AI responses** — The chat API passes the current locale to the LLM system prompt, so the assistant responds in the user's language.
- **Language switcher** — An EN/ES toggle in the sidebar footer lets users switch languages instantly.

### Adding a New Locale

1. Add the locale code to the `locales` array in `apps/web/i18n/routing.ts`
2. Create a new translation file: `apps/web/messages/{locale}.json` (copy `en.json` as a template)
3. Translate all strings in the new file

The middleware, navigation, and language switcher will pick up the new locale automatically.

---

## Using Chat

The Chat page (`/chat`) provides a conversational interface to manage your CRM. You can:

### CRM Operations

Ask the assistant to work with contacts, deals, and pipeline stages using natural language:

- **Search contacts** — *"Find contacts at Acme Corp"*, *"Look up john@example.com"*
- **View contact details** — *"Show me details for Jane Smith"* (includes linked deals)
- **Create contacts** — *"Add a new contact: John Doe, john@acme.com, works at Acme"*
  - A form card appears for you to review and edit before confirming
- **Search deals** — *"Show me all open deals"*, *"Find deals worth over $50k"*
- **Create deals** — *"Create a deal: Enterprise License for $120k"*
  - Review card appears; the assistant will look up pipeline stages and contact IDs for you
- **Move deals** — *"Move the Acme deal to Negotiation stage"*
  - A confirmation card shows current → new stage before applying

All write operations use the **human-in-the-loop (HITL) pattern**: the AI proposes, you review a form card, then confirm or cancel. Nothing is written until you approve.

The AI responds in the user's current locale — switch to Spanish and the assistant will reply in Spanish automatically.

### Conversations

Each chat is persisted as a conversation. The sidebar shows your conversation history and you can switch between them. The `X-Conversation-Id` header links messages to the conversation in the database.

---

## Agent Sessions

Agent Sessions are long-running background processes that execute multi-step plans on your behalf — follow-up sequences, reminders, nurture campaigns, and more.

### Creating a Session (via Chat)

Ask the assistant to set up a plan. Examples:

- *"Set up a 3-day follow-up sequence for the Acme deal"*
- *"Remind me to check in with Jane Smith in a week"*
- *"Create a nurture sequence: send a note now, wait 3 days, check deal status, then ask me before closing"*

The assistant will propose a plan using a **Session Plan Card** that shows:

1. The **goal** (what the session aims to accomplish)
2. An ordered list of **steps**, each with a type icon and description

Before confirming, you can:
- **Remove steps** you don't want (click the trash icon)
- **Adjust wait durations** (edit the duration field on `wait` steps, e.g. `3d`, `12h`, `1w`)

Click **Confirm & Start** to create the session and begin execution. A "View Session →" link appears once created.

### Step Types

| Type | What it does |
|---|---|
| **CRM Action** | Executes a CRM operation (create activity, log a note, update a record) and merges the result into session context |
| **Notification** | Sends you an in-app notification with the step description |
| **Wait** | Pauses execution for a duration (`30m`, `3d`, `1w`, etc.) using a delayed BullMQ job — no polling, fires exactly when the timer expires |
| **AI Reasoning** | Uses AI to analyze the accumulated session context, make decisions, and produce output for subsequent steps |
| **Human Checkpoint** | Pauses execution and notifies you for approval — the session won't continue until you approve or reject |

### Managing Sessions (`/sessions`)

The Sessions page shows all your agent sessions in a card grid:

- **Status badge** — `running`, `paused`, `waiting human`, `completed`, `failed`, `cancelled`
- **Step progress** — e.g. "Step 3/7" with a progress bar
- **Next run** — when the next step is scheduled (for sessions with active `wait` steps)
- **Quick actions** — Pause, Resume, or Cancel directly from the card

### Session Detail (`/sessions/[id]`)

Click into any session to see:

- **Header** — goal, status, action buttons (Pause / Resume / Cancel), link back to the originating chat
- **Plan stepper** (left panel) — all steps with the current one highlighted and completed ones checked
- **Vertical timeline** (right panel) — a chronological event log:
  - **Step started / completed** — when each step began and finished
  - **AI reasoning** — collapsible block showing the model's thinking
  - **CRM action result** — what was created or changed
  - **Wait scheduled** — shows duration and countdown to next run
  - **Human checkpoint** — **Approve** / **Reject** buttons appear when the session is waiting for your input
  - **Step failed** — error details in red

The detail page auto-refreshes every 5 seconds for active sessions.

### Checking Session Status (via Chat)

Ask the assistant about a running session:

- *"What's the status of the Acme follow-up session?"*
- *"Check on session [id]"*

A compact **Session Status Card** appears showing goal, status, progress, and a link to the detail page.

### Architecture Notes

- Sessions execute in the **agent-worker** on a dedicated `session-steps` BullMQ queue, separate from chat jobs
- Each step is a separate BullMQ job with **3 retry attempts** and exponential backoff
- `wait` steps use BullMQ's native **delayed jobs** — no cron or polling
- A cancelled or paused session skips any pending jobs when they fire
- The worker starts automatically alongside the existing agent-jobs worker
