// Tool registry types

export type ToolDefinition = {
  id: string;
  name: string;
  description: string | null;
  skillName: string | null;
  schemaJson: Record<string, unknown> | null;
  enabled: boolean;
};

export type ToolCallStatus = "pending" | "running" | "success" | "error";

export type ToolCallRecord = {
  id: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  params: unknown;
  result: unknown;
  durationMs: number | null;
  status: ToolCallStatus;
  createdAt: Date;
};
