Based on our entire conversation, let me put together a comprehensive scaffolding plan for your platform — a high-scale conversational agent system inspired by DenchClaw/OpenClaw, but built for 5,000+ conversations/minute with PostgreSQL as the backbone.

Let me first check a few more implementation details from DenchClaw to make sure we capture the best patterns:Based on the deep analysis of DenchClaw's actual architecture, codebase patterns, and your specific requirements (5,000+ conversations/minute, PostgreSQL, multi-channel communication), here's a comprehensive scaffolding plan for your own platform inspired by DenchClaw's best patterns but engineered for your scale.

---

# 🏗️ Scaffolding Plan: Distributed Conversational Agent Platform

## Project Structure (Monorepo)

Mirroring DenchClaw's monorepo layout but adapted for distributed, multi-tenant scale:

```
your-platform/
├── apps/
│   ├── web/                          # Next.js frontend (chat UI, dashboards)
│   │   └── ...                       # (see structure below)
│   └── mobile/                       # React Native (Expo) mobile app
│       ├── app/                      # Expo Router file-based screens
│       │   ├── (tabs)/
│       │   │   ├── chat.tsx          # Chat interface (useChat from @ai-sdk/react)
│       │   │   ├── tasks.tsx         # Task list + agent delegation status
│       │   │   ├── contacts.tsx      # CRM contacts
│       │   │   ├── deals.tsx         # Pipeline / deals view
│       │   │   └── notifications.tsx # Agent completions, alerts
│       │   ├── task/[id].tsx         # Task detail + live agent activity stream
│       │   ├── conversation/[id].tsx # Conversation detail / chat thread
│       │   └── _layout.tsx
│       ├── components/
│       │   ├── agent-activity.tsx    # GitHub-style step-by-step agent view
│       │   ├── chat-bubble.tsx
│       │   └── task-card.tsx
│       ├── lib/
│       │   ├── api.ts               # tRPC / Hono client
│       │   ├── push.ts              # Expo push notification setup
│       │   └── auth.ts              # Auth session management
│       ├── app.json                  # Expo config
│       └── package.json
│
│   # ── Web app detail ──
│   └── web/                          # Next.js frontend (chat UI, dashboards)
│       ├── app/
│       │   ├── api/
│       │   │   ├── chat/
│       │   │   │   ├── route.ts      # POST — send message, start agent run
│       │   │   │   ├── stream/
│       │   │   │   │   └── route.ts  # GET  — SSE reconnect to active run
│       │   │   │   ├── active/
│       │   │   │   │   └── route.ts  # GET  — running session IDs
│       │   │   │   ├── stop/
│       │   │   │   │   └── route.ts  # POST — abort a running agent
│       │   │   │   └── subagents/
│       │   │   │       └── route.ts  # GET  — list child agents for session
│       │   │   ├── sessions/
│       │   │   │   ├── route.ts      # GET/POST — list & create sessions
│       │   │   │   └── [id]/
│       │   │   │       └── route.ts  # GET/PATCH/DELETE — session detail
│       │   │   ├── workspace/
│       │   │   │   ├── init/route.ts
│       │   │   │   └── list/route.ts
│       │   │   ├── tools/
│       │   │   │   └── route.ts      # GET — list registered tools
│       │   │   └── channels/
│       │   │       └── route.ts      # GET — communication channel configs
│       │   ├── components/
│       │   │   ├── chat-panel.tsx     # Main chat UI (borrow DenchClaw's pattern)
│       │   │   ├── chat-message.tsx
│       │   │   ├── chat-editor/
│       │   │   ├── sidebar.tsx
│       │   │   └── ui/              # Reusable UI primitives
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── lib/
│       │   ├── active-runs.ts        # Run lifecycle manager (PostgreSQL-backed)
│       │   ├── agent-runner.ts       # Gateway WebSocket client
│       │   ├── chat-agent-registry.ts
│       │   ├── subagent-runs.ts
│       │   ├── workspace.ts
│       │   ├── db.ts                 # PostgreSQL connection pool
│       │   └── telemetry.ts
│       └── instrumentation.ts
│
├── packages/
│   ├── gateway/                      # WebSocket gateway server (scalable)
│   │   ├── src/
│   │   │   ├── server.ts            # WS server with clustering
│   │   │   ├── protocol.ts          # Frame types (req/res/event)
│   │   │   ├── auth.ts              # Token/password auth
│   │   │   ├── session-router.ts    # Route messages to correct worker
│   │   │   └── health.ts
│   │   └── package.json
│   │
│   ├── agent-worker/                 # LLM agent execution (horizontal)
│   │   ├── src/
│   │   │   ├── worker.ts            # Consumes jobs from message queue
│   │   │   ├── llm-client.ts        # AI SDK Core — unified multi-provider LLM calls
│   │   │   ├── tool-executor.ts     # Tool call dispatch (AI SDK tool loop)
│   │   │   ├── skill-loader.ts      # Load skill definitions
│   │   │   └── stream-emitter.ts    # Push SSE events via Redis Streams
│   │   └── package.json
│   │
│   ├── shared/                       # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── protocol.ts      # Gateway frame types
│   │   │   │   ├── events.ts        # SSE event types
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── tools.ts
│   │   │   │   ├── crm.ts           # Contact, Account, Lead, Deal, Pipeline types
│   │   │   │   └── auth.ts          # User, WorkspaceMember, Role types
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # Drizzle schema (source of truth)
│   │   │   │   ├── migrations/
│   │   │   │   └── queries.ts       # Typed query helpers
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── channel-adapters/             # Communication channel integrations
│       ├── src/
│       │   ├── adapter.ts           # Base adapter interface
│       │   ├── webchat.ts           # Browser WebSocket
│       │   ├── slack.ts
│       │   ├── teams.ts
│       │   ├── email.ts
│       │   └── api.ts               # REST API channel
│       └── package.json
│
├── skills/                           # Skill definitions (DenchClaw pattern)
│   ├── crm/
│   │   └── SKILL.md
│   ├── browser/
│   │   └── SKILL.md
│   └── custom/
│       └── SKILL.md
│
├── extensions/                       # Plugins (DenchClaw pattern)
│   └── analytics/
│       ├── index.ts
│       └── plugin.json
│
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.gateway
│   ├── Dockerfile.worker
│   ├── Dockerfile.web
│   └── k8s/                         # Kubernetes manifests (optional)
│
├── scripts/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

.env
```
# PostgreSQL (via PgBouncer)
POSTGRES_URL=postgresql://platform:platform@pgbouncer:5432/platform
# Redis
REDIS_URL=redis://localhost:6379
# LLM API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=sk-...
# Auth
AUTH_SECRET=...
# Gateway
GATEWAY_PORT=18789
``` 

---

## Phase 1: Foundation (Weeks 1–3)

### 1.1 — PostgreSQL Schema

Replace all of DenchClaw's file-based storage with proper relational tables:

```sql
-- Core conversation tables
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         VARCHAR(50)   NOT NULL,     -- 'webchat','slack','teams','api'
    agent_id        VARCHAR(100),
    session_key     VARCHAR(500)  NOT NULL UNIQUE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    workspace_id    UUID,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),
    ended_at        TIMESTAMPTZ   NULL
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    role            VARCHAR(20)   NOT NULL,     -- 'user','assistant','system','tool'
    content         TEXT,
    parts           JSONB,                      -- JSON array of structured parts
    seq             INT           NOT NULL,
    global_seq      BIGINT GENERATED ALWAYS AS IDENTITY,
    model           VARCHAR(200),
    tokens_in       INT,
    tokens_out      INT,
    cost_usd        DECIMAL(12,6),
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id),
    tool_name       VARCHAR(200)  NOT NULL,
    tool_call_id    VARCHAR(200)  NOT NULL,
    params          JSONB,                      -- JSON params
    result          JSONB,                      -- JSON result
    duration_ms     INT,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Agent pool (replaces DenchClaw's 5-slot hardcoded pool)
CREATE TABLE agent_pool (
    id              VARCHAR(200)  PRIMARY KEY,
    workspace_id    UUID,
    status          VARCHAR(20)   DEFAULT 'idle',  -- 'idle','busy','draining'
    current_session UUID          NULL,
    last_active_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Subagent tracking (replaces in-memory Map + JSONL files)
CREATE TABLE subagent_runs (
    session_key          VARCHAR(500) PRIMARY KEY,
    parent_session_key   VARCHAR(500) NOT NULL,
    run_id               VARCHAR(200) NOT NULL,
    task                 TEXT,
    label                VARCHAR(500),
    status               VARCHAR(20)  DEFAULT 'running',
    started_at           TIMESTAMPTZ  DEFAULT NOW(),
    ended_at             TIMESTAMPTZ  NULL
);

-- Tool/skill registry
CREATE TABLE tools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200)  NOT NULL UNIQUE,
    description     TEXT,
    skill_name      VARCHAR(200),
    schema_json     JSONB,                      -- JSON Schema for params
    enabled         BOOLEAN       DEFAULT TRUE,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Channel configurations
CREATE TABLE channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(50)   NOT NULL,     -- 'webchat','slack','teams','email'
    config          JSONB,                      -- JSON config (encrypted secrets)
    enabled         BOOLEAN       DEFAULT TRUE,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Workspaces (multi-tenant isolation)
CREATE TABLE workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200)  NOT NULL,
    slug            VARCHAR(100)  NOT NULL UNIQUE,
    owner_id        UUID          NOT NULL,
    settings        JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Add foreign keys for workspace_id
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

ALTER TABLE agent_pool ADD CONSTRAINT fk_agent_pool_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

-- ══════════════════════════════════════════════════════════════
-- USERS & AUTH
-- ══════════════════════════════════════════════════════════════

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(320)  NOT NULL UNIQUE,
    name            VARCHAR(200),
    avatar_url      TEXT,
    email_verified  BOOLEAN       DEFAULT FALSE,
    hashed_password TEXT,                       -- NULL if OAuth-only
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE accounts (                        -- OAuth provider accounts (Auth.js)
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            VARCHAR(100) NOT NULL,  -- 'google','github','credentials'
    provider_account_id VARCHAR(500) NOT NULL,
    type                VARCHAR(50)  NOT NULL,   -- 'oauth','oidc','credentials'
    access_token        TEXT,
    refresh_token       TEXT,
    expires_at          INT,
    token_type          VARCHAR(50),
    scope               TEXT,
    id_token            TEXT,
    UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (                        -- Auth.js session store
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token   VARCHAR(500) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ  NOT NULL
);

CREATE TABLE verification_tokens (             -- Auth.js email verification
    identifier      VARCHAR(320) NOT NULL,
    token           VARCHAR(500) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY(identifier, token)
);

-- Workspace membership with RBAC
CREATE TABLE workspace_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(30)  NOT NULL DEFAULT 'member',  -- 'owner','admin','member','viewer'
    invited_by      UUID         REFERENCES users(id),
    joined_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Fix: workspaces.owner_id now has a proper FK
ALTER TABLE workspaces ADD CONSTRAINT fk_workspaces_owner
    FOREIGN KEY (owner_id) REFERENCES users(id);

-- ══════════════════════════════════════════════════════════════
-- CRM ENTITIES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email           VARCHAR(320),
    phone           VARCHAR(50),
    first_name      VARCHAR(200),
    last_name       VARCHAR(200),
    company_name    VARCHAR(300),               -- denormalized for quick display
    account_id      UUID,                       -- FK added after crm_accounts
    source          VARCHAR(100),               -- 'webchat','import','manual','api'
    avatar_url      TEXT,
    custom_fields   JSONB         DEFAULT '{}',
    tags            TEXT[]        DEFAULT '{}',
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE crm_accounts (                    -- "accounts" name taken by Auth.js
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(300)  NOT NULL,
    domain          VARCHAR(300),
    industry        VARCHAR(200),
    size            VARCHAR(50),                -- 'startup','smb','mid-market','enterprise'
    website         TEXT,
    custom_fields   JSONB         DEFAULT '{}',
    tags            TEXT[]        DEFAULT '{}',
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE contacts ADD CONSTRAINT fk_contacts_account
    FOREIGN KEY (account_id) REFERENCES crm_accounts(id) ON DELETE SET NULL;

CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id      UUID          REFERENCES contacts(id) ON DELETE SET NULL,
    status          VARCHAR(30)   NOT NULL DEFAULT 'new',  -- 'new','contacted','qualified','converted','lost'
    source          VARCHAR(100),
    score           INT           DEFAULT 0,
    assigned_to     UUID          REFERENCES users(id),
    converted_at    TIMESTAMPTZ,
    custom_fields   JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE pipelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(200)  NOT NULL,
    is_default      BOOLEAN       DEFAULT FALSE,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE pipeline_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name            VARCHAR(200)  NOT NULL,
    position        INT           NOT NULL,     -- ordering
    win_probability INT           DEFAULT 0,    -- 0-100%
    UNIQUE(pipeline_id, position)
);

CREATE TABLE deals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
    stage_id        UUID NOT NULL REFERENCES pipeline_stages(id),
    contact_id      UUID          REFERENCES contacts(id) ON DELETE SET NULL,
    account_id      UUID          REFERENCES crm_accounts(id) ON DELETE SET NULL,
    title           VARCHAR(500)  NOT NULL,
    value           DECIMAL(15,2),
    currency        VARCHAR(3)    DEFAULT 'USD',
    expected_close  DATE,
    assigned_to     UUID          REFERENCES users(id),
    status          VARCHAR(20)   NOT NULL DEFAULT 'open',  -- 'open','won','lost'
    lost_reason     TEXT,
    custom_fields   JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type            VARCHAR(30)   NOT NULL,     -- 'call','email','meeting','note','task'
    subject         VARCHAR(500),
    body            TEXT,
    contact_id      UUID          REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id         UUID          REFERENCES deals(id) ON DELETE SET NULL,
    conversation_id UUID          REFERENCES conversations(id) ON DELETE SET NULL,
    performed_by    UUID          REFERENCES users(id),
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_min    INT,
    metadata        JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Link contacts ↔ conversations (many-to-many: same contact across channels)
CREATE TABLE contact_conversations (
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    PRIMARY KEY(contact_id, conversation_id)
);

-- Custom field definitions per workspace (EAV pattern)
CREATE TABLE custom_field_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entity_type     VARCHAR(30)   NOT NULL,     -- 'contact','deal','account','lead'
    field_name      VARCHAR(200)  NOT NULL,
    field_type      VARCHAR(30)   NOT NULL,     -- 'text','number','date','select','multi_select','boolean'
    options         JSONB,                      -- select/multi-select options
    required        BOOLEAN       DEFAULT FALSE,
    position        INT           DEFAULT 0,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(workspace_id, entity_type, field_name)
);

-- ══════════════════════════════════════════════════════════════
-- AGENT BEHAVIOR & PROMPT MANAGEMENT
-- ══════════════════════════════════════════════════════════════

CREATE TABLE agent_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            VARCHAR(200)  NOT NULL,     -- 'Support Bot','Sales Agent'
    slug            VARCHAR(100)  NOT NULL,
    model           VARCHAR(200)  NOT NULL DEFAULT 'anthropic/claude-4-sonnet',
    temperature     DECIMAL(3,2)  DEFAULT 0.7,
    max_tokens      INT           DEFAULT 4096,
    max_steps       INT           DEFAULT 10,
    is_default      BOOLEAN       DEFAULT FALSE,
    enabled         BOOLEAN       DEFAULT TRUE,
    metadata        JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(workspace_id, slug)
);

CREATE TABLE prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_config_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
    version         INT           NOT NULL DEFAULT 1,
    label           VARCHAR(200),               -- 'v1-launch','v2-empathetic'
    system_prompt   TEXT          NOT NULL,
    is_active       BOOLEAN       DEFAULT FALSE, -- only one active per agent_config
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(agent_config_id, version)
);

-- Track which prompt version each conversation used (for A/B analysis)
ALTER TABLE conversations ADD COLUMN prompt_template_id UUID
    REFERENCES prompt_templates(id);
ALTER TABLE conversations ADD COLUMN agent_config_id UUID
    REFERENCES agent_configs(id);
ALTER TABLE conversations ADD COLUMN contact_id UUID
    REFERENCES contacts(id);

-- Indexes for high-throughput queries
CREATE INDEX IX_messages_conversation ON messages(conversation_id, seq);
CREATE INDEX IX_messages_global_seq ON messages(global_seq);
CREATE INDEX IX_conversations_status ON conversations(status, channel);
CREATE INDEX IX_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IX_tool_calls_message ON tool_calls(message_id);
CREATE INDEX IX_subagent_parent ON subagent_runs(parent_session_key);
CREATE INDEX IX_workspaces_slug ON workspaces(slug);
CREATE INDEX IX_agent_pool_workspace ON agent_pool(workspace_id);

-- Auth indexes
CREATE INDEX IX_accounts_user ON accounts(user_id);
CREATE INDEX IX_sessions_user ON sessions(user_id);
CREATE INDEX IX_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IX_workspace_members_workspace ON workspace_members(workspace_id);

-- CRM indexes
CREATE INDEX IX_contacts_workspace ON contacts(workspace_id);
CREATE INDEX IX_contacts_email ON contacts(workspace_id, email);
CREATE INDEX IX_contacts_account ON contacts(account_id);
CREATE INDEX IX_crm_accounts_workspace ON crm_accounts(workspace_id);
CREATE INDEX IX_leads_workspace ON leads(workspace_id, status);
CREATE INDEX IX_deals_workspace ON deals(workspace_id, status);
CREATE INDEX IX_deals_pipeline ON deals(pipeline_id, stage_id);
CREATE INDEX IX_deals_contact ON deals(contact_id);
CREATE INDEX IX_activities_workspace ON activities(workspace_id, type);
CREATE INDEX IX_activities_contact ON activities(contact_id);
CREATE INDEX IX_activities_deal ON activities(deal_id);
CREATE INDEX IX_activities_conversation ON activities(conversation_id);
CREATE INDEX IX_contact_conversations_conv ON contact_conversations(conversation_id);

-- Agent config indexes
CREATE INDEX IX_agent_configs_workspace ON agent_configs(workspace_id);
CREATE INDEX IX_prompt_templates_agent ON prompt_templates(agent_config_id, is_active);
CREATE INDEX IX_conversations_agent_config ON conversations(agent_config_id);
CREATE INDEX IX_conversations_prompt ON conversations(prompt_template_id);
CREATE INDEX IX_conversations_contact ON conversations(contact_id);

-- ══════════════════════════════════════════════════════════════
-- TASKS & AGENT DELEGATION
-- ══════════════════════════════════════════════════════════════

-- Tasks can be manual (human) or delegated to an AI agent.
-- When type='agent', the task spawns a sub-agent via BullMQ.
-- The subagent_run_key links to the running agent's session in subagent_runs.
-- On completion, the agent writes its output to tasks.result (JSONB).
CREATE TABLE tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title             VARCHAR(500)  NOT NULL,
    description       TEXT,
    type              VARCHAR(30)   NOT NULL DEFAULT 'manual',   -- 'manual','agent','automated'
    status            VARCHAR(30)   NOT NULL DEFAULT 'pending',  -- 'pending','in_progress','completed','failed','cancelled'
    priority          VARCHAR(20)   DEFAULT 'medium',            -- 'low','medium','high','urgent'
    contact_id        UUID          REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id           UUID          REFERENCES deals(id) ON DELETE SET NULL,
    conversation_id   UUID          REFERENCES conversations(id) ON DELETE SET NULL,
    assigned_to       UUID          REFERENCES users(id),        -- human assignee
    delegated_to_agent UUID         REFERENCES agent_configs(id),-- agent assignee
    subagent_run_key  VARCHAR(500),                              -- link to subagent_runs.session_key
    due_at            TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    result            JSONB,                                     -- agent output / deliverable
    created_by        UUID          REFERENCES users(id),
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════

-- In-app + push notifications for agent completions, task updates,
-- mentions, and system alerts. Mobile app polls or receives push.
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50)   NOT NULL,     -- 'task_completed','agent_finished','mention','deal_won','system'
    title           VARCHAR(500)  NOT NULL,
    body            TEXT,
    link            TEXT,                       -- deep link: '/tasks/{id}', '/conversations/{id}'
    read            BOOLEAN       DEFAULT FALSE,
    task_id         UUID          REFERENCES tasks(id) ON DELETE CASCADE,
    conversation_id UUID          REFERENCES conversations(id) ON DELETE SET NULL,
    metadata        JSONB         DEFAULT '{}',
    created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Push notification device tokens for mobile (Expo Push / FCM / APNS)
CREATE TABLE push_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT          NOT NULL,
    platform        VARCHAR(20)   NOT NULL,     -- 'ios','android','web'
    device_name     VARCHAR(200),
    active          BOOLEAN       DEFAULT TRUE,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- Task & notification indexes
CREATE INDEX IX_tasks_workspace ON tasks(workspace_id, status);
CREATE INDEX IX_tasks_assigned ON tasks(assigned_to, status);
CREATE INDEX IX_tasks_contact ON tasks(contact_id);
CREATE INDEX IX_tasks_deal ON tasks(deal_id);
CREATE INDEX IX_tasks_conversation ON tasks(conversation_id);
CREATE INDEX IX_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX IX_notifications_workspace ON notifications(workspace_id, created_at DESC);
CREATE INDEX IX_push_tokens_user ON push_tokens(user_id);

-- ══════════════════════════════════════════════════════════════
-- DATA RETENTION: TimescaleDB hypertables
-- Run AFTER enabling the TimescaleDB extension:
--   CREATE EXTENSION IF NOT EXISTS timescaledb;
-- ══════════════════════════════════════════════════════════════

-- Convert high-volume tables to hypertables (auto-partitioned by time)
-- NOTE: hypertables require created_at to be part of the PK or have a unique index.
-- We remove the UUID PK constraint and use a composite approach:

-- Messages hypertable
-- SELECT create_hypertable('messages', 'created_at',
--     chunk_time_interval => INTERVAL '1 week',
--     migrate_data => true
-- );

-- Activities hypertable
-- SELECT create_hypertable('activities', 'created_at',
--     chunk_time_interval => INTERVAL '1 month',
--     migrate_data => true
-- );

-- Enable compression on messages older than 30 days
-- ALTER TABLE messages SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'conversation_id',
--     timescaledb.compress_orderby = 'seq ASC'
-- );
-- SELECT add_compression_policy('messages', INTERVAL '30 days');

-- Continuous aggregate for conversation analytics
-- CREATE MATERIALIZED VIEW daily_conversation_stats
-- WITH (timescaledb.continuous) AS
-- SELECT
--     workspace_id,
--     time_bucket('1 day', c.created_at) AS day,
--     COUNT(*)                           AS total_conversations,
--     COUNT(*) FILTER (WHERE status = 'active') AS active,
--     AVG(EXTRACT(EPOCH FROM (ended_at - c.created_at))) AS avg_duration_sec
-- FROM conversations c
-- GROUP BY workspace_id, day;

-- Retention policy: auto-drop raw message chunks older than 90 days
-- (archived to S3 before drop — see archival job below)
-- SELECT add_retention_policy('messages', INTERVAL '90 days');
```

### 1.1b — Drizzle ORM Schema

TypeScript schema definition for Drizzle ORM (`packages/shared/src/db/schema.ts`). Drizzle generates migrations from this file — keep it in sync with the SQL above.

```tsx
// packages/shared/src/db/schema.ts

import { pgTable, uuid, varchar, text, integer, bigint, boolean, decimal, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Workspaces ──────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
    id:        uuid("id").primaryKey().defaultRandom(),
    name:      varchar("name", { length: 200 }).notNull(),
    slug:      varchar("slug", { length: 100 }).notNull().unique(),
    ownerId:   uuid("owner_id").notNull(),
    settings:  jsonb("settings").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    uniqueIndex("IX_workspaces_slug").on(t.slug),
]);

// ── Conversations ───────────────────────────────────────────

export const conversations = pgTable("conversations", {
    id:          uuid("id").primaryKey().defaultRandom(),
    channel:     varchar("channel", { length: 50 }).notNull(),
    agentId:     varchar("agent_id", { length: 100 }),
    sessionKey:  varchar("session_key", { length: 500 }).notNull().unique(),
    status:      varchar("status", { length: 20 }).notNull().default("active"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    contactId:        uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    agentConfigId:    uuid("agent_config_id").references(() => agentConfigs.id, { onDelete: "set null" }),
    promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
    createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow(),
    endedAt:     timestamp("ended_at", { withTimezone: true }),
}, (t) => [
    index("IX_conversations_status").on(t.status, t.channel),
    index("IX_conversations_workspace").on(t.workspaceId),
    index("IX_conversations_contact").on(t.contactId),
    index("IX_conversations_agent_config").on(t.agentConfigId),
    index("IX_conversations_prompt").on(t.promptTemplateId),
]);

// ── Messages ────────────────────────────────────────────────

export const messages = pgTable("messages", {
    id:             uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    role:           varchar("role", { length: 20 }).notNull(),
    content:        text("content"),
    parts:          jsonb("parts"),
    seq:            integer("seq").notNull(),
    globalSeq:      bigint("global_seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    model:          varchar("model", { length: 200 }),
    tokensIn:       integer("tokens_in"),
    tokensOut:      integer("tokens_out"),
    costUsd:        decimal("cost_usd", { precision: 12, scale: 6 }),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_messages_conversation").on(t.conversationId, t.seq),
    index("IX_messages_global_seq").on(t.globalSeq),
]);

// ── Tool calls ──────────────────────────────────────────────

export const toolCalls = pgTable("tool_calls", {
    id:         uuid("id").primaryKey().defaultRandom(),
    messageId:  uuid("message_id").notNull().references(() => messages.id),
    toolName:   varchar("tool_name", { length: 200 }).notNull(),
    toolCallId: varchar("tool_call_id", { length: 200 }).notNull(),
    params:     jsonb("params"),
    result:     jsonb("result"),
    durationMs: integer("duration_ms"),
    status:     varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_tool_calls_message").on(t.messageId),
]);

// ── Agent pool ──────────────────────────────────────────────

export const agentPool = pgTable("agent_pool", {
    id:             varchar("id", { length: 200 }).primaryKey(),
    workspaceId:    uuid("workspace_id").references(() => workspaces.id),
    status:         varchar("status", { length: 20 }).default("idle"),
    currentSession: uuid("current_session"),
    lastActiveAt:   timestamp("last_active_at", { withTimezone: true }),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_agent_pool_workspace").on(t.workspaceId),
]);

// ── Subagent runs ───────────────────────────────────────────

export const subagentRuns = pgTable("subagent_runs", {
    sessionKey:       varchar("session_key", { length: 500 }).primaryKey(),
    parentSessionKey: varchar("parent_session_key", { length: 500 }).notNull(),
    runId:            varchar("run_id", { length: 200 }).notNull(),
    task:             text("task"),
    label:            varchar("label", { length: 500 }),
    status:           varchar("status", { length: 20 }).default("running"),
    startedAt:        timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt:          timestamp("ended_at", { withTimezone: true }),
}, (t) => [
    index("IX_subagent_parent").on(t.parentSessionKey),
]);

// ── Tools registry ──────────────────────────────────────────

export const tools = pgTable("tools", {
    id:          uuid("id").primaryKey().defaultRandom(),
    name:        varchar("name", { length: 200 }).notNull().unique(),
    description: text("description"),
    skillName:   varchar("skill_name", { length: 200 }),
    schemaJson:  jsonb("schema_json"),
    enabled:     boolean("enabled").default(true),
    createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Channels ────────────────────────────────────────────────

export const channels = pgTable("channels", {
    id:        uuid("id").primaryKey().defaultRandom(),
    type:      varchar("type", { length: 50 }).notNull(),
    config:    jsonb("config"),
    enabled:   boolean("enabled").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Relations ───────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ many }) => ({
    conversations: many(conversations),
    agents:        many(agentPool),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
    workspace:      one(workspaces,       { fields: [conversations.workspaceId],      references: [workspaces.id] }),
    contact:        one(contacts,         { fields: [conversations.contactId],         references: [contacts.id] }),
    agentConfig:    one(agentConfigs,     { fields: [conversations.agentConfigId],     references: [agentConfigs.id] }),
    promptTemplate: one(promptTemplates,  { fields: [conversations.promptTemplateId],  references: [promptTemplates.id] }),
    messages:       many(messages),
    activities:     many(activities),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
    conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
    toolCalls:    many(toolCalls),
}));

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
    message: one(messages, { fields: [toolCalls.messageId], references: [messages.id] }),
}));

// ══════════════════════════════════════════════════════════════
// USERS & AUTH (Auth.js compatible)
// ══════════════════════════════════════════════════════════════

export const users = pgTable("users", {
    id:             uuid("id").primaryKey().defaultRandom(),
    email:          varchar("email", { length: 320 }).notNull().unique(),
    name:           varchar("name", { length: 200 }),
    avatarUrl:      text("avatar_url"),
    emailVerified:  boolean("email_verified").default(false),
    hashedPassword: text("hashed_password"),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const authAccounts = pgTable("accounts", {
    id:                uuid("id").primaryKey().defaultRandom(),
    userId:            uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider:          varchar("provider", { length: 100 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 500 }).notNull(),
    type:              varchar("type", { length: 50 }).notNull(),
    accessToken:       text("access_token"),
    refreshToken:      text("refresh_token"),
    expiresAt:         integer("expires_at"),
    tokenType:         varchar("token_type", { length: 50 }),
    scope:             text("scope"),
    idToken:           text("id_token"),
}, (t) => [
    index("IX_accounts_user").on(t.userId),
]);

export const authSessions = pgTable("sessions", {
    id:           uuid("id").primaryKey().defaultRandom(),
    userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 500 }).notNull().unique(),
    expiresAt:    timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
    index("IX_sessions_user").on(t.userId),
]);

export const workspaceMembers = pgTable("workspace_members", {
    id:          uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role:        varchar("role", { length: 30 }).notNull().default("member"),
    invitedBy:   uuid("invited_by").references(() => users.id),
    joinedAt:    timestamp("joined_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_workspace_members_user").on(t.userId),
    index("IX_workspace_members_workspace").on(t.workspaceId),
]);

// ══════════════════════════════════════════════════════════════
// CRM ENTITIES
// ══════════════════════════════════════════════════════════════

export const contacts = pgTable("contacts", {
    id:           uuid("id").primaryKey().defaultRandom(),
    workspaceId:  uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email:        varchar("email", { length: 320 }),
    phone:        varchar("phone", { length: 50 }),
    firstName:    varchar("first_name", { length: 200 }),
    lastName:     varchar("last_name", { length: 200 }),
    companyName:  varchar("company_name", { length: 300 }),
    accountId:    uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    source:       varchar("source", { length: 100 }),
    avatarUrl:    text("avatar_url"),
    customFields: jsonb("custom_fields").default({}),
    tags:         text("tags").array().default([]),
    createdBy:    uuid("created_by").references(() => users.id),
    createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_contacts_workspace").on(t.workspaceId),
    index("IX_contacts_email").on(t.workspaceId, t.email),
    index("IX_contacts_account").on(t.accountId),
]);

export const crmAccounts = pgTable("crm_accounts", {
    id:           uuid("id").primaryKey().defaultRandom(),
    workspaceId:  uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name:         varchar("name", { length: 300 }).notNull(),
    domain:       varchar("domain", { length: 300 }),
    industry:     varchar("industry", { length: 200 }),
    size:         varchar("size", { length: 50 }),
    website:      text("website"),
    customFields: jsonb("custom_fields").default({}),
    tags:         text("tags").array().default([]),
    createdBy:    uuid("created_by").references(() => users.id),
    createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_crm_accounts_workspace").on(t.workspaceId),
]);

export const leads = pgTable("leads", {
    id:           uuid("id").primaryKey().defaultRandom(),
    workspaceId:  uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    contactId:    uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status:       varchar("status", { length: 30 }).notNull().default("new"),
    source:       varchar("source", { length: 100 }),
    score:        integer("score").default(0),
    assignedTo:   uuid("assigned_to").references(() => users.id),
    convertedAt:  timestamp("converted_at", { withTimezone: true }),
    customFields: jsonb("custom_fields").default({}),
    createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_leads_workspace").on(t.workspaceId, t.status),
]);

export const pipelines = pgTable("pipelines", {
    id:          uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name:        varchar("name", { length: 200 }).notNull(),
    isDefault:   boolean("is_default").default(false),
    createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pipelineStages = pgTable("pipeline_stages", {
    id:             uuid("id").primaryKey().defaultRandom(),
    pipelineId:     uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    name:           varchar("name", { length: 200 }).notNull(),
    position:       integer("position").notNull(),
    winProbability: integer("win_probability").default(0),
});

export const deals = pgTable("deals", {
    id:            uuid("id").primaryKey().defaultRandom(),
    workspaceId:   uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId:    uuid("pipeline_id").notNull().references(() => pipelines.id),
    stageId:       uuid("stage_id").notNull().references(() => pipelineStages.id),
    contactId:     uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    accountId:     uuid("account_id").references(() => crmAccounts.id, { onDelete: "set null" }),
    title:         varchar("title", { length: 500 }).notNull(),
    value:         decimal("value", { precision: 15, scale: 2 }),
    currency:      varchar("currency", { length: 3 }).default("USD"),
    expectedClose: timestamp("expected_close", { mode: "date" }),
    assignedTo:    uuid("assigned_to").references(() => users.id),
    status:        varchar("status", { length: 20 }).notNull().default("open"),
    lostReason:    text("lost_reason"),
    customFields:  jsonb("custom_fields").default({}),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_deals_workspace").on(t.workspaceId, t.status),
    index("IX_deals_pipeline").on(t.pipelineId, t.stageId),
    index("IX_deals_contact").on(t.contactId),
]);

export const activities = pgTable("activities", {
    id:             uuid("id").primaryKey().defaultRandom(),
    workspaceId:    uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    type:           varchar("type", { length: 30 }).notNull(),
    subject:        varchar("subject", { length: 500 }),
    body:           text("body"),
    contactId:      uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId:         uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    performedBy:    uuid("performed_by").references(() => users.id),
    scheduledAt:    timestamp("scheduled_at", { withTimezone: true }),
    completedAt:    timestamp("completed_at", { withTimezone: true }),
    durationMin:    integer("duration_min"),
    metadata:       jsonb("metadata").default({}),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_activities_workspace").on(t.workspaceId, t.type),
    index("IX_activities_contact").on(t.contactId),
    index("IX_activities_deal").on(t.dealId),
    index("IX_activities_conversation").on(t.conversationId),
]);

export const contactConversations = pgTable("contact_conversations", {
    contactId:      uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
}, (t) => [
    index("IX_contact_conversations_conv").on(t.conversationId),
]);

export const customFieldDefinitions = pgTable("custom_field_definitions", {
    id:          uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    entityType:  varchar("entity_type", { length: 30 }).notNull(),
    fieldName:   varchar("field_name", { length: 200 }).notNull(),
    fieldType:   varchar("field_type", { length: 30 }).notNull(),
    options:     jsonb("options"),
    required:    boolean("required").default(false),
    position:    integer("position").default(0),
    createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════
// AGENT BEHAVIOR & PROMPT MANAGEMENT
// ══════════════════════════════════════════════════════════════

export const agentConfigs = pgTable("agent_configs", {
    id:          uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name:        varchar("name", { length: 200 }).notNull(),
    slug:        varchar("slug", { length: 100 }).notNull(),
    model:       varchar("model", { length: 200 }).notNull().default("anthropic/claude-4-sonnet"),
    temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.7"),
    maxTokens:   integer("max_tokens").default(4096),
    maxSteps:    integer("max_steps").default(10),
    isDefault:   boolean("is_default").default(false),
    enabled:     boolean("enabled").default(true),
    metadata:    jsonb("metadata").default({}),
    createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const promptTemplates = pgTable("prompt_templates", {
    id:            uuid("id").primaryKey().defaultRandom(),
    agentConfigId: uuid("agent_config_id").notNull().references(() => agentConfigs.id, { onDelete: "cascade" }),
    version:       integer("version").notNull().default(1),
    label:         varchar("label", { length: 200 }),
    systemPrompt:  text("system_prompt").notNull(),
    isActive:      boolean("is_active").default(false),
    createdBy:     uuid("created_by").references(() => users.id),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_prompt_templates_agent").on(t.agentConfigId, t.isActive),
]);

// ── Extended Relations ──────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
    authAccounts:      many(authAccounts),
    authSessions:      many(authSessions),
    workspaceMemberships: many(workspaceMembers),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
    workspace:     one(workspaces, { fields: [contacts.workspaceId], references: [workspaces.id] }),
    account:       one(crmAccounts, { fields: [contacts.accountId], references: [crmAccounts.id] }),
    leads:         many(leads),
    deals:         many(deals),
    activities:    many(activities),
}));

export const crmAccountsRelations = relations(crmAccounts, ({ one, many }) => ({
    workspace: one(workspaces, { fields: [crmAccounts.workspaceId], references: [workspaces.id] }),
    contacts:  many(contacts),
    deals:     many(deals),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
    workspace: one(workspaces, { fields: [deals.workspaceId], references: [workspaces.id] }),
    pipeline:  one(pipelines, { fields: [deals.pipelineId], references: [pipelines.id] }),
    stage:     one(pipelineStages, { fields: [deals.stageId], references: [pipelineStages.id] }),
    contact:   one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
    account:   one(crmAccounts, { fields: [deals.accountId], references: [crmAccounts.id] }),
    activities: many(activities),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
    workspace: one(workspaces, { fields: [pipelines.workspaceId], references: [workspaces.id] }),
    stages:    many(pipelineStages),
    deals:     many(deals),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
    workspace:    one(workspaces, { fields: [activities.workspaceId], references: [workspaces.id] }),
    contact:      one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
    deal:         one(deals, { fields: [activities.dealId], references: [deals.id] }),
    conversation: one(conversations, { fields: [activities.conversationId], references: [conversations.id] }),
    performer:    one(users, { fields: [activities.performedBy], references: [users.id] }),
}));

export const agentConfigsRelations = relations(agentConfigs, ({ one, many }) => ({
    workspace: one(workspaces, { fields: [agentConfigs.workspaceId], references: [workspaces.id] }),
    prompts:   many(promptTemplates),
}));

export const promptTemplatesRelations = relations(promptTemplates, ({ one }) => ({
    agentConfig: one(agentConfigs, { fields: [promptTemplates.agentConfigId], references: [agentConfigs.id] }),
    createdByUser: one(users, { fields: [promptTemplates.createdBy], references: [users.id] }),
}));

// ══════════════════════════════════════════════════════════════
// TASKS & AGENT DELEGATION
// ══════════════════════════════════════════════════════════════

export const tasks = pgTable("tasks", {
    id:               uuid("id").primaryKey().defaultRandom(),
    workspaceId:      uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title:            varchar("title", { length: 500 }).notNull(),
    description:      text("description"),
    type:             varchar("type", { length: 30 }).notNull().default("manual"),
    status:           varchar("status", { length: 30 }).notNull().default("pending"),
    priority:         varchar("priority", { length: 20 }).default("medium"),
    contactId:        uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId:           uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    conversationId:   uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    assignedTo:       uuid("assigned_to").references(() => users.id),
    delegatedToAgent: uuid("delegated_to_agent").references(() => agentConfigs.id),
    subagentRunKey:   varchar("subagent_run_key", { length: 500 }),
    dueAt:            timestamp("due_at", { withTimezone: true }),
    completedAt:      timestamp("completed_at", { withTimezone: true }),
    result:           jsonb("result"),
    createdBy:        uuid("created_by").references(() => users.id),
    createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_tasks_workspace").on(t.workspaceId, t.status),
    index("IX_tasks_assigned").on(t.assignedTo, t.status),
    index("IX_tasks_contact").on(t.contactId),
    index("IX_tasks_deal").on(t.dealId),
    index("IX_tasks_conversation").on(t.conversationId),
]);

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

export const notifications = pgTable("notifications", {
    id:             uuid("id").primaryKey().defaultRandom(),
    workspaceId:    uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type:           varchar("type", { length: 50 }).notNull(),
    title:          varchar("title", { length: 500 }).notNull(),
    body:           text("body"),
    link:           text("link"),
    read:           boolean("read").default(false),
    taskId:         uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    metadata:       jsonb("metadata").default({}),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_notifications_user").on(t.userId, t.read, t.createdAt),
    index("IX_notifications_workspace").on(t.workspaceId, t.createdAt),
]);

export const pushTokens = pgTable("push_tokens", {
    id:         uuid("id").primaryKey().defaultRandom(),
    userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token:      text("token").notNull(),
    platform:   varchar("platform", { length: 20 }).notNull(),
    deviceName: varchar("device_name", { length: 200 }),
    active:     boolean("active").default(true),
    createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
    index("IX_push_tokens_user").on(t.userId),
]);

// ── Task & Notification Relations ───────────────────────────

export const tasksRelations = relations(tasks, ({ one }) => ({
    workspace:    one(workspaces, { fields: [tasks.workspaceId], references: [workspaces.id] }),
    contact:      one(contacts, { fields: [tasks.contactId], references: [contacts.id] }),
    deal:         one(deals, { fields: [tasks.dealId], references: [deals.id] }),
    conversation: one(conversations, { fields: [tasks.conversationId], references: [conversations.id] }),
    assignee:     one(users, { fields: [tasks.assignedTo], references: [users.id] }),
    agentConfig:  one(agentConfigs, { fields: [tasks.delegatedToAgent], references: [agentConfigs.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user:         one(users, { fields: [notifications.userId], references: [users.id] }),
    workspace:    one(workspaces, { fields: [notifications.workspaceId], references: [workspaces.id] }),
    task:         one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
    conversation: one(conversations, { fields: [notifications.conversationId], references: [conversations.id] }),
}));
```

### 1.2 — Gateway Protocol (Borrowed from DenchClaw)

Implement the same clean `req/res/event` WebSocket protocol:

```tsx
// packages/shared/src/types/protocol.ts

export type GatewayReqFrame = {
    type: "req";
    id: string;
    method: string;    // "connect","agent","agent.subscribe","sessions.patch",
                       // "chat.abort","health"
    params?: unknown;
};

export type GatewayResFrame = {
    type: "res";
    id: string;
    ok: boolean;
    payload?: unknown;
    error?: unknown;
};

export type GatewayEventFrame = {
    type: "event";
    event: string;     // "agent","chat","error","connect.challenge"
    seq?: number;
    payload?: unknown;
};
```

### 1.3 — SSE Event Types (Borrowed from DenchClaw)

DenchClaw defines these SSE event types for streaming to the frontend:

```tsx
// packages/shared/src/types/events.ts

export type SseEvent =
    | { type: "text-delta"; delta: string }
    | { type: "reasoning"; text: string }
    | { type: "tool-input-start"; toolCallId: string }
    | { type: "tool-input-available"; toolCallId: string; toolName: string; args: unknown }
    | { type: "tool-output-partial"; toolCallId: string; output: string }
    | { type: "tool-result"; toolCallId: string; result: unknown }
    | { type: "error"; error: string }
    | { type: "finish"; finishReason: string };
```

### 1.4 — Data Retention & Archival Strategy

At 5,000 conversations/minute (~72M messages/day), raw PostgreSQL tables will degrade within weeks. This section outlines the three-tier strategy: **hot → warm → cold**.

#### Option A: TimescaleDB (Recommended)

TimescaleDB is a PostgreSQL extension — no separate database. It adds:
- **Hypertables**: automatic time-based partitioning (the `messages` table becomes chunked by week)
- **Compression**: 90-95% storage reduction on old chunks (columnar compression)
- **Continuous aggregates**: materialized views that auto-refresh (e.g., daily conversation stats)
- **Retention policies**: auto-drop chunks older than N days

```yaml
# Add to infra/docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb:latest-pg16  # replaces postgres:16-alpine
    # everything else stays the same
```

The SQL commands to enable hypertables are in the schema above (section 1.1, commented out — uncomment after TimescaleDB is installed).

#### Option B: Native PostgreSQL Partitioning (No Extension)

If you prefer not to use TimescaleDB:

```sql
-- Declarative range partitioning on messages
CREATE TABLE messages (
    -- ... same columns ...
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (automate with pg_partman or a cron job)
CREATE TABLE messages_2026_03 PARTITION OF messages
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE messages_2026_04 PARTITION OF messages
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... generate dynamically
```

#### Archival Pipeline (Hot → Warm → Cold)

| Tier | Storage | Retention | Access Pattern |
| --- | --- | --- | --- |
| **Hot** (0-30 days) | PostgreSQL / TimescaleDB (uncompressed) | Active queries, real-time | Sub-ms via indexes |
| **Warm** (30-90 days) | TimescaleDB compressed chunks | Rare queries, replay | ~100ms (decompress on read) |
| **Cold** (90+ days) | S3 / R2 (Parquet or compressed JSONL) | Compliance, analytics | Seconds (download + parse) |

**Archival job** (runs nightly via BullMQ scheduled job or pg_cron):
1. `SELECT * FROM messages WHERE created_at < NOW() - INTERVAL '90 days'` → export to S3 as Parquet
2. Verify S3 write succeeded (checksum)
3. `DELETE FROM messages WHERE created_at < NOW() - INTERVAL '90 days'` (or let TimescaleDB retention policy handle it)

#### GDPR / Data Deletion

When a user requests data deletion:
1. Look up all `contacts` for that user's email
2. Follow the FK chain: `contacts` → `contact_conversations` → `conversations` → `messages` → `tool_calls`
3. Also delete: `activities`, `leads`, `deals` linked to those contacts
4. For archived data in S3: mark records in a `deletion_requests` table, process async with a cleanup job that rewrites Parquet files excluding deleted records
5. Log the deletion event for audit compliance

```sql
CREATE TABLE deletion_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    entity_type     VARCHAR(30)  NOT NULL,   -- 'contact','user'
    entity_id       UUID         NOT NULL,
    requested_by    UUID         NOT NULL REFERENCES users(id),
    status          VARCHAR(20)  DEFAULT 'pending',  -- 'pending','processing','completed','failed'
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
```

---

## Phase 2: Gateway & Worker Layer (Weeks 3–6)

### 2.1 — Stateless Gateway Cluster

Unlike DenchClaw's single-process gateway, yours uses Redis Streams for fan-out:

```tsx
// packages/gateway/src/server.ts

import { App } from "uWebSockets.js";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Each gateway instance reads from a Redis Streams consumer group
const CONSUMER_GROUP = "gateway";
const CONSUMER_NAME = INSTANCE_ID;

function handleConnection(ws, req) {
    ws.on("message", async (data) => {
        const frame = JSON.parse(data);

        if (frame.type === "req" && frame.method === "agent") {
            // Add job to Redis Stream for worker consumption
            await redis.xadd("stream:agent-jobs", "*",
                "sessionKey", frame.params.sessionKey,
                "message", frame.params.message,
                "gatewayId", INSTANCE_ID,
            );
        }
    });

    // Read events for this session from Redis Streams (consumer group)
    pollEvents(ws, sessionKey);
}

async function pollEvents(ws, sessionKey: string) {
    const streamKey = `stream:events:${sessionKey}`;
    // Ensure consumer group exists
    try {
        await redis.xgroup("CREATE", streamKey, CONSUMER_GROUP, "0", "MKSTREAM");
    } catch { /* group already exists */ }

    while (ws.readyState === 1) {
        const results = await redis.xreadgroup(
            "GROUP", CONSUMER_GROUP, CONSUMER_NAME,
            "COUNT", 100, "BLOCK", 5000,
            "STREAMS", streamKey, ">"
        );
        if (!results) continue;
        for (const [, entries] of results) {
            for (const [id, fields] of entries) {
                ws.send(JSON.stringify({ type: "event", ...parseFields(fields) }));
                await redis.xack(streamKey, CONSUMER_GROUP, id);
            }
        }
    }
}
```

### 2.2 — Agent Workers (Horizontal)

```tsx
// packages/agent-worker/src/worker.ts

import { consume } from "./queue";
import { streamText } from "ai";
import { createProvider } from "./llm-client";  // wraps AI SDK provider setup
import { publishEvent } from "./stream-emitter";

consume("agent:jobs", async (job) => {
    const { sessionKey, message } = job;

    // Load conversation history from PostgreSQL
    const history = await db.getMessages(sessionKey);

    // Load applicable skills (returns AI SDK-compatible tool definitions)
    const skills = await loadSkills(job.workspaceId);

    // AI SDK Core — streamText() handles the full tool-call loop:
    // LLM responds → requests tool → execute → feed result → LLM continues
    const result = streamText({
        model: createProvider(job.model ?? "anthropic/claude-4-sonnet"),
        messages: [...history, { role: "user", content: message }],
        tools: skills.tools,       // Zod-validated tool schemas
        maxSteps: 10,              // max tool-call round-trips
        onStepFinish: async (step) => {
            // Persist completed step to PostgreSQL
            await db.appendStep(sessionKey, step);
        },
    });

    // Stream text deltas + tool events to Redis for gateway fan-out
    for await (const part of result.fullStream) {
        await publishEvent(sessionKey, part);
    }
});
```

### 2.3 — Plugin Hook System (Borrowed from DenchClaw)

```tsx
// packages/agent-worker/src/hooks.ts

type HookEvent =
    | "before_tool_call"
    | "after_tool_call"
    | "agent_end"
    | "message_received"
    | "session_start"
    | "session_end";

class PluginManager {
    private hooks = new Map<HookEvent, Array<{ fn: Function; priority: number }>>();

    on(event: HookEvent, fn: Function, opts?: { priority?: number }) {
        const list = this.hooks.get(event) ?? [];
        list.push({ fn, priority: opts?.priority ?? 0 });
        list.sort((a, b) => a.priority - b.priority);
        this.hooks.set(event, list);
    }

    async emit(event: HookEvent, data: unknown, ctx: unknown) {
        for (const hook of this.hooks.get(event) ?? []) {
            await hook.fn(data, ctx);
        }
    }
}
```

---

## Phase 3: Web Frontend (Weeks 5–8)

### 3.1 — Chat API (Adapted from DenchClaw)

Borrow DenchClaw's exact pattern but back it with PostgreSQL + Redis:

```tsx
// apps/web/app/api/chat/route.ts

export async function POST(req: Request) {
    const { messages, sessionId } = await req.json();
    const userText = extractUserText(messages);

    // Check for active run (PostgreSQL, not in-memory Map)
    if (await db.hasActiveRun(sessionId)) {
        return new Response("Active run in progress", { status: 409 });
    }

    // Allocate agent from pool (PostgreSQL, not 5-slot file)
    const agent = await db.allocateAgent(sessionId);

    // Publish to worker queue
    await queue.publish("agent:jobs", {
        sessionKey: `agent:${agent.id}:web:${sessionId}`,
        message: userText,
    });

    // SSE stream from Redis subscription
    const stream = createSSEStream(sessionId);
    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" }
    });
}
```

### 3.2 — ActiveRun Manager (PostgreSQL-Backed)

Replace DenchClaw's in-memory `Map<string, ActiveRun>` + JSONL files:

```tsx
// apps/web/lib/active-runs.ts

// DenchClaw uses: globalThis.__openclaw_activeRuns (in-memory Map)
// You use: PostgreSQL + Redis

export async function startRun(params: StartRunParams): Promise<ActiveRun> {
    const run = await db.query(`
        INSERT INTO conversations (session_key, agent_id, channel, status)
        VALUES ($1, $2, $3, 'active')
    `, [params.sessionKey, params.agentId, params.channel]);

    return run;
}

export async function subscribeToRun(
    sessionId: string,
    callback: RunSubscriber,
    options?: { replay?: boolean }
) {
    const streamKey = `stream:events:${sessionId}`;
    let lastId = "0";

    if (options?.replay) {
        // Replay from Redis Stream history (or PostgreSQL for older events)
        const entries = await redis.xrange(streamKey, "-", "+");
        for (const [id, fields] of entries) {
            callback(parseFields(fields));
            lastId = id;
        }
    }

    // Live events from Redis Streams (blocking read)
    return streamConsumer(streamKey, lastId, callback);
}
```

### 3.3 — Chat Panel Component

Reuse DenchClaw's frontend patterns — they already use `@ai-sdk/react`:

```tsx
// apps/web/app/components/chat-panel.tsx

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const transport = new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({ sessionId, channel: "webchat" }),
});

const { messages, sendMessage, status } = useChat({ transport });
```

---

## Phase 4: Channel Adapters (Weeks 7–10)

```tsx
// packages/channel-adapters/src/adapter.ts

export interface ChannelAdapter {
    readonly channelType: string;
    initialize(config: ChannelConfig): Promise<void>;
    onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
    sendMessage(conversationId: string, content: string): Promise<void>;
    sendTypingIndicator(conversationId: string): Promise<void>;
}

// packages/channel-adapters/src/slack.ts
export class SlackAdapter implements ChannelAdapter { /* ... */ }

// packages/channel-adapters/src/teams.ts
export class TeamsAdapter implements ChannelAdapter { /* ... */ }

// packages/channel-adapters/src/email.ts
export class EmailAdapter implements ChannelAdapter { /* ... */ }
```

---

## Phase 5: Deployment & Scaling (Weeks 9–12)

### Docker Compose (Development)

```yaml
# infra/docker-compose.yml
services:
  web:
    build: { dockerfile: infra/Dockerfile.web }
    ports: ["3100:3100"]
    depends_on: [pgbouncer, redis, gateway]
    environment:
      # Web connects through PgBouncer, not directly to postgres
      POSTGRES_URL: postgresql://platform:platform@pgbouncer:5432/platform

  gateway:
    build: { dockerfile: infra/Dockerfile.gateway }
    ports: ["18789:18789"]
    deploy:
      replicas: 3
    depends_on: [redis]

  worker:
    build: { dockerfile: infra/Dockerfile.worker }
    deploy:
      replicas: 10
    depends_on: [pgbouncer, redis]
    environment:
      # Workers connect through PgBouncer too
      POSTGRES_URL: postgresql://platform:platform@pgbouncer:5432/platform

  pgbouncer:
    image: bitnami/pgbouncer:latest
    ports: ["5432:5432"]          # PgBouncer takes over the standard PG port
    depends_on: [postgres]
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_DATABASE: platform
      POSTGRESQL_USERNAME: platform
      POSTGRESQL_PASSWORD: platform
      PGBOUNCER_DATABASE: platform
      PGBOUNCER_POOL_MODE: transaction   # Transaction mode: best for stateless workers
      PGBOUNCER_MAX_CLIENT_CONN: 2000    # Max connections from your app side
      PGBOUNCER_DEFAULT_POOL_SIZE: 25    # Connections PgBouncer holds to Postgres
      PGBOUNCER_MIN_POOL_SIZE: 5
      PGBOUNCER_RESERVE_POOL_SIZE: 5
      PGBOUNCER_RESERVE_POOL_TIMEOUT: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes   # Enable persistence for Redis Streams

  postgres:
    image: timescale/timescaledb:latest-pg16
    ports: ["5433:5432"]   # Expose on 5433 so 5432 is free for PgBouncer
    environment:
      POSTGRES_USER: platform
      POSTGRES_PASSWORD: platform
      POSTGRES_DB: platform
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Milestone Summary

| Phase | Duration | Deliverable | DenchClaw Pattern Used |
| --- | --- | --- | --- |
| **Phase 1** | Weeks 1–3 | PostgreSQL schema, gateway protocol, event types | Frame types, session key format, SSE events |
| **Phase 2** | Weeks 3–6 | Stateless gateway cluster, worker pool, plugin hooks | WebSocket protocol, hook architecture, skill loader |
| **Phase 3** | Weeks 5–8 | Chat UI, API routes, PostgreSQL-backed run manager | Chat panel, API route structure, `@ai-sdk/react` |
| **Phase 4** | Weeks 7–10 | Slack/Teams/email adapters | Channel concept from gateway |
| **Phase 5** | Weeks 9–12 | Docker, load balancing, auto-scaling | — (DenchClaw is single-machine) |

---

## What You're Keeping from DenchClaw vs. Building New

| Borrowed from DenchClaw | Built from Scratch for Scale |
| --- | --- |
| ✅ WebSocket `req/res/event` frame protocol | 🆕 Redis Streams fan-out across gateway nodes |
| ✅ SSE event types (`text-delta`, `tool-input-start`, etc.) | 🆕 PostgreSQL-backed session & message storage |
| ✅ Chat API route structure (`/api/chat`, `/api/chat/stream`) | 🆕 Dynamic agent pool (not 5 hardcoded slots) |
| ✅ `@ai-sdk/react` + `useChat` frontend pattern | 🆕 Message queue for worker distribution |
| ✅ Plugin hook system (`before_tool_call`, `agent_end`) | 🆕 Multi-channel adapter layer |
| ✅ Skill-as-Markdown context injection | 🆕 Horizontal worker scaling |
| ✅ Subagent parent/child tracking concept | 🆕 Redis for hot state, PostgreSQL for persistence |
| — | 🆕 Full CRM entity layer (Contacts, Accounts, Leads, Deals, Pipelines, Activities) |
| — | 🆕 Users + Auth.js tables + RBAC workspace membership |
| — | 🆕 Agent configs + versioned prompt templates (A/B testing) |
| — | 🆕 TimescaleDB hypertables + S3 archival + GDPR deletion flows |

This gives you a platform that captures DenchClaw's best UX and architectural ideas but is fundamentally built for your PostgreSQL backend and 5,000+ conversations/minute target. Want me to deep-dive into any specific phase or component?

---

Great question! Let me analyze the current stack and suggest improvements across each layer, focusing on performance, reliability, developer experience, and scalability at your 5,000+ conversations/minute target.

---

## Recommended Improvements by Layer

### 1. **Frontend**

| Current | Improved | Why |
| --- | --- | --- |
| `@ai-sdk/react` + `useChat` | **Vercel AI SDK 4.0+** with `useChat` + `useCompletion` | Latest version has better streaming primitives, structured output support, and multi-modal handling |
| Tailwind CSS | **shadcn/ui + Tailwind** | Pre-built accessible components that match DenchClaw's UI patterns, faster development |
| — | **TanStack Query (React Query)** | Efficient server-state caching for sessions, tools, and channel configs; avoids redundant API calls |

---

### 2. **API Layer**

| Current | Improved | Why |
| --- | --- | --- |
| Express.js or tRPC | **Hono** | Ultra-lightweight, edge-compatible, faster than Express. Works seamlessly in Next.js API routes and standalone deployments |
| — | **Zod + tRPC** (keep for internal APIs) | Type-safe end-to-end communication between frontend and backend |

---

### 3. **Gateway & Real-Time Layer**

| Current | Improved | Why |
| --- | --- | --- |
| `ws` library | **uWebSockets.js** | 10x–20x faster than `ws`; handles 1M+ concurrent connections per node. Critical at 5,000+ conv/min |
| Redis Pub/Sub only | **Redis Streams** (instead of Pub/Sub) | Durable, replayable event log with consumer groups. Pub/Sub loses messages if a subscriber is down; Streams guarantee delivery |
| BullMQ | **BullMQ** (keep) or **Kafka** (if multi-DC) | BullMQ is excellent for single-region. If you go multi-datacenter, Kafka provides durable, partitioned streaming |

---

### 4. **Agent Workers**

| Current | Improved | Why |
| --- | --- | --- |
| Node.js workers | **Node.js + Worker Threads** or **Bun** | Worker threads for CPU-bound tool execution; Bun is 3x faster for I/O-heavy workloads |
| Manual LLM client | **Vercel AI SDK Core** (`ai` + `@ai-sdk/*` providers) | Unified multi-provider interface via `streamText()`/`generateText()`, built-in tool-call loop with `maxSteps`, structured output via `generateObject()`, streaming primitives that map directly to SSE events. Used in agent-worker for LLM calls and in frontend via `@ai-sdk/react` `useChat()` |
| Manual tool execution | **Model Context Protocol (MCP)** | Standardized protocol for tool integration — same one GitHub Copilot uses. Future-proof and ecosystem-compatible |
| Zod for validation | **Zod + TypeBox** | TypeBox generates JSON Schema at compile-time — faster runtime validation for high-throughput tool params |

---

### 5. **Database Layer**

| Current | Improved | Why |
| --- | --- | --- |
| Prisma or Sequelize | **Drizzle ORM** | 10x faster than Prisma at scale, zero overhead, SQL-like syntax, excellent PostgreSQL support, fully type-safe |
| Raw SQL for hot queries | **Stored Procedures + Drizzle** | Use stored procedures for critical-path queries (agent allocation, message insertion) for maximum throughput |
| — | **Read Replicas** | Route read queries (session history, tool registry) to replicas; writes go to primary |
| — | **Connection Pooling (PgBouncer)** | Use PgBouncer as a connection pooler sidecar to handle 10K+ concurrent worker connections |
| — | **TimescaleDB** | PostgreSQL extension for automatic time-partitioning (hypertables), 90%+ compression, continuous aggregates, and retention policies. Critical for 72M messages/day |

---

### 6. **Caching & State**

| Current | Improved | Why |
| --- | --- | --- |
| Redis (single instance) | **Redis Cluster** or **Dragonfly** | Redis Cluster for HA; Dragonfly is a drop-in Redis replacement that's 25x faster on multi-core machines |
| — | **Tiered Caching** | L1: In-process LRU (hot sessions), L2: Redis (warm state), L3: PostgreSQL (cold storage) |

---

### 7. **Observability**

| Current | Improved | Why |
| --- | --- | --- |
| Prometheus + Grafana | **OpenTelemetry + Grafana Stack** | OpenTelemetry is the industry standard for traces, metrics, and logs — vendor-neutral and comprehensive |
| ELK Stack | **Grafana Loki** (logs) + **Tempo** (traces) | Lighter weight than ELK, integrates natively with Grafana, lower operational cost |
| — | **Sentry** | Real-time error tracking with context — critical for debugging LLM failures and tool errors |

---

### 8. **Auth & Security**

| Current | Improved | Why |
| --- | --- | --- |
| Auth0 / Azure AD | **Auth.js (NextAuth v5)** | Built-in Next.js integration, supports multiple providers, simpler than standalone Auth0 |
| — | **Rate Limiting: Upstash Ratelimit** | Serverless-friendly rate limiting backed by Redis — essential at 5,000+ conv/min |
| — | **HashiCorp Vault** or **Infisical** | Secure secrets management for LLM API keys, channel credentials, DB passwords |

---

### 9. **DevOps & Infrastructure**

| Current | Improved | Why |
| --- | --- | --- |
| Docker + K8s | **Docker + K8s + KEDA** | KEDA auto-scales workers based on BullMQ queue depth — scale from 2 to 100 workers automatically |
| GitHub Actions | **GitHub Actions + Turborepo** | Turborepo caches builds across the monorepo — CI runs 10x faster |
| NGINX load balancer | **Traefik** or **Envoy** | Native WebSocket support, automatic service discovery in K8s, built-in circuit breaking |
| — | **Helm Charts** | Templated K8s deployments for consistent environment provisioning |

---

### 10. **New Additions**

| Addition | Why |
| --- | --- |
| **Model Context Protocol (MCP)** | Standardized tool/skill integration — aligns with where the industry is heading (GitHub Copilot, Claude, etc.) |
| **LLM Gateway (LiteLLM or Portkey)** | Unified proxy for all LLM providers — handles rate limits, fallbacks, cost tracking, and API key rotation |
| **Feature Flags (LaunchDarkly or Unleash)** | Safely roll out new LLM models, skills, or channel adapters without full deployments |
| **Dead Letter Queue (DLQ)** | Capture failed agent jobs for retry/debugging — critical at scale |

---

## Updated Architecture Diagram

```mermaid
graph TD
    subgraph Clients
        U1[Browser - Chat UI]
        U2[Slack]
        U3[Microsoft Teams]
        U4[Email]
        U5[REST API]
    end

    subgraph Channel Adapters
        CA1[WebChat Adapter]
        CA2[Slack Adapter]
        CA3[Teams Adapter]
        CA4[Email Adapter]
        CA5[API Adapter]
    end

    subgraph Web Frontend - Next.js + shadcn/ui
        FE1[Chat Panel - Vercel AI SDK 4]
        FE2[Dashboard - TanStack Query]
        FE3[API Routes - Hono]
        FE3A["/api/chat - POST"]
        FE3B["/api/chat/stream - SSE"]
        FE3C["/api/sessions"]
    end

    subgraph Auth
        AUTH[Auth.js + Users/RBAC]
        RL[Upstash Rate Limiter]
        VAULT[Secrets Manager]
    end

    subgraph Gateway Layer - uWebSockets.js Cluster
        LB[Traefik / Envoy]
        GW1[Gateway Node 1]
        GW2[Gateway Node 2]
        GW3[Gateway Node N]
    end

    subgraph Message Bus
        RS[(Redis Streams - Dragonfly)]
        Q1[BullMQ Job Queue]
        DLQ[Dead Letter Queue]
    end

    subgraph Agent Workers - KEDA Auto-Scaled
        W1[Worker 1 - Bun/Node]
        W2[Worker 2 - Bun/Node]
        W3[Worker N]
        WC[Worker Components]
        LLM_GW[LLM Gateway - LiteLLM/Portkey]
        MCP[MCP Tool Server]
        WC3[Skill Loader]
        WC4[Plugin Manager]
        WC5[Stream Emitter]
    end

    subgraph Persistence - PostgreSQL + TimescaleDB
        DB[(PostgreSQL Primary - TimescaleDB)]
        DBR[(PostgreSQL Read Replica)]
        CACHE[Tiered Cache: L1 LRU + L2 Redis]
        S3[(S3 / R2 - Cold Archive)]
    end

    subgraph CRM Data Layer
        CRM_C[Contacts]
        CRM_A[Accounts]
        CRM_L[Leads]
        CRM_D[Deals / Pipelines]
        CRM_ACT[Activities]
        CRM_T[Tasks]
    end

    subgraph Mobile App - Expo React Native
        MOB1[Chat Screen - useChat]
        MOB2[Tasks Screen]
        MOB3[Agent Activity View]
        MOB4[CRM Screens]
        MOB5[Push Notifications]
    end

    subgraph LLM Providers
        LLM1[OpenAI]
        LLM2[Anthropic]
        LLM3[Google Gemini]
        LLM4[Local Models]
    end

    subgraph Tool Integrations - via MCP
        EXT1[CRM]
        EXT2[Browser Automation]
        EXT3[Custom Skills]
    end

    subgraph Observability - OpenTelemetry
        OT[OpenTelemetry Collector]
        GR[Grafana]
        LK[Loki - Logs]
        TM[Tempo - Traces]
        PR[Prometheus - Metrics]
        SE[Sentry - Errors]
    end

    subgraph CI/CD
        GHA[GitHub Actions + Turborepo]
        HELM[Helm Charts]
        KEDA[KEDA Autoscaler]
        FF[Feature Flags - Unleash]
    end

    %% Client flow
    U1 --> CA1
    U2 --> CA2
    U3 --> CA3
    U4 --> CA4
    U5 --> CA5

    CA1 --> LB
    CA2 --> LB
    CA3 --> LB
    CA4 --> LB
    CA5 --> LB

    LB --> GW1
    LB --> GW2
    LB --> GW3

    %% Frontend
    FE1 --> FE3
    FE2 --> FE3
    FE3 --> FE3A
    FE3 --> FE3B
    FE3 --> FE3C
    FE3A --> LB
    FE3B -- "SSE subscribe" --> RS

    %% Auth
    AUTH --> FE3
    RL --> FE3
    AUTH --> GW1
    VAULT --> LLM_GW
    VAULT --> DB

    %% Gateway to bus
    GW1 -- "Enqueue" --> Q1
    GW2 -- "Enqueue" --> Q1
    GW3 -- "Enqueue" --> Q1
    GW1 -- "Subscribe" --> RS
    GW2 -- "Subscribe" --> RS
    GW3 -- "Subscribe" --> RS

    %% Workers
    Q1 --> W1
    Q1 --> W2
    Q1 --> W3
    Q1 -- "Failed jobs" --> DLQ

    W1 --> WC
    W2 --> WC
    W3 --> WC
    WC --> LLM_GW
    WC --> MCP
    WC --> WC3
    WC --> WC4
    WC5 -- "Publish events" --> RS

    %% LLM Gateway
    LLM_GW --> LLM1
    LLM_GW --> LLM2
    LLM_GW --> LLM3
    LLM_GW --> LLM4

    %% MCP Tools
    MCP --> EXT1
    MCP --> EXT2
    MCP --> EXT3

    %% Persistence
    WC -- "Write" --> DB
    WC -- "Read" --> CACHE
    CACHE -- "L2 miss" --> DBR
    FE3C -- "Read" --> DBR
    DB -- "Archive 90d+" --> S3

    %% CRM Data (stored in PostgreSQL, accessed by workers + frontend)
    CRM_C --> DB
    CRM_A --> DB
    CRM_L --> DB
    CRM_D --> DB
    CRM_ACT --> DB
    WC -- "CRM ops" --> CRM_C
    WC -- "CRM ops" --> CRM_D
    FE2 -- "CRM views" --> CRM_C
    FE2 -- "CRM views" --> CRM_D

    %% KEDA scaling
    KEDA -- "Scale on queue depth" --> W1
    KEDA -- "Scale on queue depth" --> W2

    %% Observability
    GW1 -. "Traces/Metrics" .-> OT
    W1 -. "Traces/Metrics" .-> OT
    FE3 -. "Traces/Metrics" .-> OT
    OT --> GR
    OT --> LK
    OT --> TM
    OT --> PR
    W1 -. "Errors" .-> SE

    %% Mobile app
    MOB1 --> FE3A
    MOB2 --> FE3C
    MOB3 -- "SSE subscribe" --> RS
    MOB4 --> FE3C
    MOB5 --> RS

    %% Tasks
    CRM_T --> DB
    WC -- "Create/complete tasks" --> CRM_T

    %% CI/CD
    GHA --> HELM
    FF --> WC
```

---

## Summary of Key Upgrades

| Area | Biggest Impact Change | Performance Gain |
| --- | --- | --- |
| **WebSocket** | `ws` → **uWebSockets.js** | 10–20x more connections per node |
| **Event Streaming** | Redis Pub/Sub → **Redis Streams** | Durable, replayable, guaranteed delivery |
| **ORM** | Prisma → **Drizzle ORM** | 10x faster queries, zero runtime overhead |
| **LLM Integration** | Manual client → **AI SDK Core + LiteLLM + MCP** | Unified streaming, built-in tool loop, standardized tools |
| **Auto-Scaling** | Manual replicas → **KEDA** | Scale workers 2→100 based on queue depth |
| **Caching** | Single Redis → **Tiered (LRU + Redis + PG)** | Sub-ms reads for hot sessions |
| **Observability** | ELK → **OpenTelemetry + Grafana Stack** | Unified traces/metrics/logs, lower cost |
| **CI/CD** | GitHub Actions → **+ Turborepo** | 10x faster monorepo builds |
| **CRM Layer** | None → **Contacts, Accounts, Leads, Deals, Pipelines, Activities** | AI agents can actually operate on business data |
| **Auth** | Dangling `owner_id` → **Users + Auth.js tables + RBAC workspace_members** | Multi-tenant access control, audit trails |
| **Prompt Mgmt** | Hardcoded prompts → **agent_configs + prompt_templates with versioning** | A/B testing, rollback, per-workspace personas |
| **Data Retention** | Unbounded growth → **TimescaleDB hypertables + S3 archival + GDPR flows** | Survive 72M messages/day without PG collapse |
| **Tasks & Delegation** | None → **tasks table + agent delegation via subagent_runs** | Users create tasks from chat, delegate to AI agents, track progress |
| **Notifications** | None → **notifications + push_tokens tables + Expo Push** | Real-time alerts for agent completions, task updates, mobile push |
| **Mobile App** | None → **React Native (Expo) in apps/mobile/** | Same TypeScript stack, shared types, `useChat()` for chat, push notifications |

These upgrades keep the same architectural philosophy from DenchClaw but make each layer production-hardened for your scale target. Would you like me to dive deeper into any specific layer or create a more detailed implementation plan for any of these improvements?
