import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  decimal,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════
// WORKSPACES
// ══════════════════════════════════════════════════════════════

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    ownerId: uuid("owner_id").notNull(),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("IX_workspaces_slug").on(t.slug)],
);

// ══════════════════════════════════════════════════════════════
// USERS & AUTH (Auth.js compatible)
// ══════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 200 }),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").default(false),
  hashedPassword: text("hashed_password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const authAccounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 100 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 500,
    }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: integer("expires_at"),
    tokenType: varchar("token_type", { length: 50 }),
    scope: text("scope"),
    idToken: text("id_token"),
  },
  (t) => [index("IX_accounts_user").on(t.userId)],
);

export const authSessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 500 })
      .notNull()
      .unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("IX_sessions_user").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 320 }).notNull(),
    token: varchar("token", { length: 500 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 30 }).notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_workspace_members_user").on(t.userId),
    index("IX_workspace_members_workspace").on(t.workspaceId),
  ],
);

// ══════════════════════════════════════════════════════════════
// AGENT BEHAVIOR & PROMPT MANAGEMENT
// ══════════════════════════════════════════════════════════════

export const agentConfigs = pgTable("agent_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  model: varchar("model", { length: 200 })
    .notNull()
    .default("anthropic/claude-4-sonnet"),
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default(
    "0.7",
  ),
  maxTokens: integer("max_tokens").default(4096),
  maxSteps: integer("max_steps").default(10),
  isDefault: boolean("is_default").default(false),
  enabled: boolean("enabled").default(true),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentConfigId: uuid("agent_config_id")
      .notNull()
      .references(() => agentConfigs.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    label: varchar("label", { length: 200 }),
    systemPrompt: text("system_prompt").notNull(),
    isActive: boolean("is_active").default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_prompt_templates_agent").on(t.agentConfigId, t.isActive),
  ],
);

// ══════════════════════════════════════════════════════════════
// CRM ENTITIES
// ══════════════════════════════════════════════════════════════

export const crmAccounts = pgTable(
  "crm_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    domain: varchar("domain", { length: 300 }),
    industry: varchar("industry", { length: 200 }),
    size: varchar("size", { length: 50 }),
    website: text("website"),
    customFields: jsonb("custom_fields").default({}),
    tags: text("tags").array().default([]),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("IX_crm_accounts_workspace").on(t.workspaceId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 50 }),
    firstName: varchar("first_name", { length: 200 }),
    lastName: varchar("last_name", { length: 200 }),
    companyName: varchar("company_name", { length: 300 }),
    accountId: uuid("account_id").references(() => crmAccounts.id, {
      onDelete: "set null",
    }),
    source: varchar("source", { length: 100 }),
    avatarUrl: text("avatar_url"),
    customFields: jsonb("custom_fields").default({}),
    tags: text("tags").array().default([]),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_contacts_workspace").on(t.workspaceId),
    index("IX_contacts_email").on(t.workspaceId, t.email),
    index("IX_contacts_account").on(t.accountId),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 30 }).notNull().default("new"),
    source: varchar("source", { length: 100 }),
    score: integer("score").default(0),
    assignedTo: uuid("assigned_to").references(() => users.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    customFields: jsonb("custom_fields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("IX_leads_workspace").on(t.workspaceId, t.status)],
);

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id")
    .notNull()
    .references(() => pipelines.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  position: integer("position").notNull(),
  winProbability: integer("win_probability").default(0),
});

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    accountId: uuid("account_id").references(() => crmAccounts.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull(),
    value: decimal("value", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("USD"),
    expectedClose: date("expected_close"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    lostReason: text("lost_reason"),
    customFields: jsonb("custom_fields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_deals_workspace").on(t.workspaceId, t.status),
    index("IX_deals_pipeline").on(t.pipelineId, t.stageId),
    index("IX_deals_contact").on(t.contactId),
  ],
);

// ══════════════════════════════════════════════════════════════
// CONVERSATIONS & MESSAGES
// ══════════════════════════════════════════════════════════════

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }),
    channel: varchar("channel", { length: 50 }).notNull(),
    agentId: varchar("agent_id", { length: 100 }),
    sessionKey: varchar("session_key", { length: 500 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    agentConfigId: uuid("agent_config_id").references(() => agentConfigs.id, {
      onDelete: "set null",
    }),
    promptTemplateId: uuid("prompt_template_id").references(
      () => promptTemplates.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("IX_conversations_status").on(t.status, t.channel),
    index("IX_conversations_workspace").on(t.workspaceId),
    index("IX_conversations_contact").on(t.contactId),
    index("IX_conversations_agent_config").on(t.agentConfigId),
    index("IX_conversations_prompt").on(t.promptTemplateId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content"),
    parts: jsonb("parts"),
    seq: integer("seq").notNull(),
    globalSeq: bigint("global_seq", {
      mode: "number",
    }).generatedAlwaysAsIdentity(),
    model: varchar("model", { length: 200 }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: decimal("cost_usd", { precision: 12, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_messages_conversation").on(t.conversationId, t.seq),
    index("IX_messages_global_seq").on(t.globalSeq),
  ],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    toolName: varchar("tool_name", { length: 200 }).notNull(),
    toolCallId: varchar("tool_call_id", { length: 200 }).notNull(),
    params: jsonb("params"),
    result: jsonb("result"),
    durationMs: integer("duration_ms"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("IX_tool_calls_message").on(t.messageId)],
);

// ══════════════════════════════════════════════════════════════
// AGENT POOL & SUBAGENT RUNS
// ══════════════════════════════════════════════════════════════

export const agentPool = pgTable(
  "agent_pool",
  {
    id: varchar("id", { length: 200 }).primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    status: varchar("status", { length: 20 }).default("idle"),
    currentSession: uuid("current_session"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("IX_agent_pool_workspace").on(t.workspaceId)],
);

export const subagentRuns = pgTable(
  "subagent_runs",
  {
    sessionKey: varchar("session_key", { length: 500 }).primaryKey(),
    parentSessionKey: varchar("parent_session_key", {
      length: 500,
    }).notNull(),
    runId: varchar("run_id", { length: 200 }).notNull(),
    task: text("task"),
    label: varchar("label", { length: 500 }),
    status: varchar("status", { length: 20 }).default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("IX_subagent_parent").on(t.parentSessionKey)],
);

// ══════════════════════════════════════════════════════════════
// TOOL & CHANNEL REGISTRY
// ══════════════════════════════════════════════════════════════

export const tools = pgTable("tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  description: text("description"),
  skillName: varchar("skill_name", { length: 200 }),
  schemaJson: jsonb("schema_json"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 50 }).notNull(),
  config: jsonb("config"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════
// ACTIVITIES & CONTACT-CONVERSATION JUNCTION
// ══════════════════════════════════════════════════════════════

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 30 }).notNull(),
    subject: varchar("subject", { length: 500 }),
    body: text("body"),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id").references(() => deals.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    performedBy: uuid("performed_by").references(() => users.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMin: integer("duration_min"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_activities_workspace").on(t.workspaceId, t.type),
    index("IX_activities_contact").on(t.contactId),
    index("IX_activities_deal").on(t.dealId),
    index("IX_activities_conversation").on(t.conversationId),
  ],
);

export const contactConversations = pgTable(
  "contact_conversations",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.conversationId] }),
    index("IX_contact_conversations_conv").on(t.conversationId),
  ],
);

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  fieldName: varchar("field_name", { length: 200 }).notNull(),
  fieldType: varchar("field_type", { length: 30 }).notNull(),
  options: jsonb("options"),
  required: boolean("required").default(false),
  position: integer("position").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════
// TASKS & AGENT DELEGATION
// ══════════════════════════════════════════════════════════════

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 30 }).notNull().default("manual"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    priority: varchar("priority", { length: 20 }).default("medium"),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id").references(() => deals.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    assignedTo: uuid("assigned_to").references(() => users.id),
    delegatedToAgent: uuid("delegated_to_agent").references(
      () => agentConfigs.id,
    ),
    subagentRunKey: varchar("subagent_run_key", { length: 500 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: jsonb("result"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_tasks_workspace").on(t.workspaceId, t.status),
    index("IX_tasks_assigned").on(t.assignedTo, t.status),
    index("IX_tasks_contact").on(t.contactId),
    index("IX_tasks_deal").on(t.dealId),
    index("IX_tasks_conversation").on(t.conversationId),
  ],
);

// ══════════════════════════════════════════════════════════════
// AGENT SESSIONS
// ══════════════════════════════════════════════════════════════

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    goal: text("goal").notNull(),
    plan: jsonb("plan").notNull(), // array of step definitions
    status: varchar("status", { length: 30 })
      .notNull()
      .default("running"), // running | paused | waiting_human | completed | failed | cancelled
    context: jsonb("context").default({}), // accumulated state
    currentStepIndex: integer("current_step_index").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_agent_sessions_workspace").on(t.workspaceId),
    index("IX_agent_sessions_status").on(t.status),
    index("IX_agent_sessions_conversation").on(t.conversationId),
  ],
);

export const sessionEvents = pgTable(
  "session_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index"),
    type: varchar("type", { length: 50 }).notNull(), // step_started | step_completed | ai_reasoning | crm_action_result | wait_scheduled | human_checkpoint_requested | human_checkpoint_resolved | step_failed
    data: jsonb("data").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_session_events_session").on(t.sessionId, t.createdAt),
  ],
);

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    body: text("body"),
    link: text("link"),
    read: boolean("read").default(false),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("IX_notifications_user").on(t.userId, t.read, t.createdAt),
    index("IX_notifications_workspace").on(t.workspaceId, t.createdAt),
  ],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 20 }).notNull(),
    deviceName: varchar("device_name", { length: 200 }),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("IX_push_tokens_user").on(t.userId)],
);

// ══════════════════════════════════════════════════════════════
// GDPR / DATA DELETION REQUESTS
// ══════════════════════════════════════════════════════════════

export const deletionRequests = pgTable("deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════
// RELATIONS
// ══════════════════════════════════════════════════════════════

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  conversations: many(conversations),
  agents: many(agentPool),
  members: many(workspaceMembers),
  agentConfigs: many(agentConfigs),
  contacts: many(contacts),
  crmAccounts: many(crmAccounts),
  pipelines: many(pipelines),
  leads: many(leads),
  deals: many(deals),
  tasks: many(tasks),
}));

export const usersRelations = relations(users, ({ many }) => ({
  authAccounts: many(authAccounts),
  authSessions: many(authSessions),
  workspaceMemberships: many(workspaceMembers),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [conversations.workspaceId],
      references: [workspaces.id],
    }),
    contact: one(contacts, {
      fields: [conversations.contactId],
      references: [contacts.id],
    }),
    agentConfig: one(agentConfigs, {
      fields: [conversations.agentConfigId],
      references: [agentConfigs.id],
    }),
    promptTemplate: one(promptTemplates, {
      fields: [conversations.promptTemplateId],
      references: [promptTemplates.id],
    }),
    messages: many(messages),
    activities: many(activities),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  toolCalls: many(toolCalls),
}));

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  message: one(messages, {
    fields: [toolCalls.messageId],
    references: [messages.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contacts.workspaceId],
    references: [workspaces.id],
  }),
  account: one(crmAccounts, {
    fields: [contacts.accountId],
    references: [crmAccounts.id],
  }),
  leads: many(leads),
  deals: many(deals),
  activities: many(activities),
}));

export const crmAccountsRelations = relations(
  crmAccounts,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [crmAccounts.workspaceId],
      references: [workspaces.id],
    }),
    contacts: many(contacts),
    deals: many(deals),
  }),
);

export const dealsRelations = relations(deals, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [deals.workspaceId],
    references: [workspaces.id],
  }),
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  stage: one(pipelineStages, {
    fields: [deals.stageId],
    references: [pipelineStages.id],
  }),
  contact: one(contacts, {
    fields: [deals.contactId],
    references: [contacts.id],
  }),
  account: one(crmAccounts, {
    fields: [deals.accountId],
    references: [crmAccounts.id],
  }),
  activities: many(activities),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [pipelines.workspaceId],
    references: [workspaces.id],
  }),
  stages: many(pipelineStages),
  deals: many(deals),
}));

export const pipelineStagesRelations = relations(
  pipelineStages,
  ({ one }) => ({
    pipeline: one(pipelines, {
      fields: [pipelineStages.pipelineId],
      references: [pipelines.id],
    }),
  }),
);

export const activitiesRelations = relations(activities, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [activities.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [activities.contactId],
    references: [contacts.id],
  }),
  deal: one(deals, {
    fields: [activities.dealId],
    references: [deals.id],
  }),
  conversation: one(conversations, {
    fields: [activities.conversationId],
    references: [conversations.id],
  }),
  performer: one(users, {
    fields: [activities.performedBy],
    references: [users.id],
  }),
}));

export const agentConfigsRelations = relations(
  agentConfigs,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [agentConfigs.workspaceId],
      references: [workspaces.id],
    }),
    prompts: many(promptTemplates),
  }),
);

export const promptTemplatesRelations = relations(
  promptTemplates,
  ({ one }) => ({
    agentConfig: one(agentConfigs, {
      fields: [promptTemplates.agentConfigId],
      references: [agentConfigs.id],
    }),
    createdByUser: one(users, {
      fields: [promptTemplates.createdBy],
      references: [users.id],
    }),
  }),
);

export const tasksRelations = relations(tasks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [tasks.contactId],
    references: [contacts.id],
  }),
  deal: one(deals, { fields: [tasks.dealId], references: [deals.id] }),
  conversation: one(conversations, {
    fields: [tasks.conversationId],
    references: [conversations.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),
  agentConfig: one(agentConfigs, {
    fields: [tasks.delegatedToAgent],
    references: [agentConfigs.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [notifications.workspaceId],
    references: [workspaces.id],
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
  conversation: one(conversations, {
    fields: [notifications.conversationId],
    references: [conversations.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [leads.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [leads.contactId],
    references: [contacts.id],
  }),
  assignee: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
  }),
}));

export const agentSessionsRelations = relations(
  agentSessions,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [agentSessions.workspaceId],
      references: [workspaces.id],
    }),
    conversation: one(conversations, {
      fields: [agentSessions.conversationId],
      references: [conversations.id],
    }),
    events: many(sessionEvents),
  }),
);

export const sessionEventsRelations = relations(sessionEvents, ({ one }) => ({
  session: one(agentSessions, {
    fields: [sessionEvents.sessionId],
    references: [agentSessions.id],
  }),
}));
