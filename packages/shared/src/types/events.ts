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

export type SseEvent =
  | SseTextDelta
  | SseReasoning
  | SseToolInputStart
  | SseToolInputAvailable
  | SseToolOutputPartial
  | SseToolResult
  | SseError
  | SseFinish;
