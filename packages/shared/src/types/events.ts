// SSE event types for streaming agent responses to the frontend

export type SseTextDelta = { type: "text-delta"; delta: string };
export type SseReasoning = { type: "reasoning"; text: string };
export type SseToolInputStart = {
  type: "tool-input-start";
  toolCallId: string;
};
export type SseToolInputAvailable = {
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  args: unknown;
};
export type SseToolOutputPartial = {
  type: "tool-output-partial";
  toolCallId: string;
  output: string;
};
export type SseToolResult = {
  type: "tool-result";
  toolCallId: string;
  result: unknown;
};
export type SseError = { type: "error"; error: string };
export type SseFinish = { type: "finish"; finishReason: string };

// Session step lifecycle events (emitted by session-worker)
export type SseSessionStepStarted = {
  type: "step_started";
  stepIndex: number;
  stepType: string;
  description: string;
};
export type SseSessionStepCompleted = {
  type: "step_completed";
  stepIndex: number;
  stepType: string;
};
export type SseSessionStepFailed = {
  type: "step_failed";
  stepIndex: number;
  error: string;
};
export type SseSessionAiReasoning = {
  type: "ai_reasoning";
  stepIndex: number;
  reasoningText: string;
};
export type SseSessionCrmActionResult = {
  type: "crm_action_result";
  stepIndex: number;
  action: string;
  description: string;
  executedAt: string;
};
export type SseSessionWaitScheduled = {
  type: "wait_scheduled";
  stepIndex: number;
  duration: string;
  delayMs: number;
  nextRunAt: string;
};
export type SseSessionHumanCheckpoint = {
  type: "human_checkpoint_requested";
  stepIndex: number;
  description: string;
};
export type SseSessionCompleted = { type: "session_completed" };

// User-targeted notification event (delivered via per-user Redis stream)
export type SseNotification = {
  type: "notification";
  id: string;
  notificationType: string;
  title: string;
  body?: string | null;
  link?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SseEvent =
  | SseTextDelta
  | SseReasoning
  | SseToolInputStart
  | SseToolInputAvailable
  | SseToolOutputPartial
  | SseToolResult
  | SseError
  | SseFinish
  | SseSessionStepStarted
  | SseSessionStepCompleted
  | SseSessionStepFailed
  | SseSessionAiReasoning
  | SseSessionCrmActionResult
  | SseSessionWaitScheduled
  | SseSessionHumanCheckpoint
  | SseSessionCompleted
  | SseNotification;
