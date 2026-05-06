import type { UIMessage } from "ai";
import { isToolUIPart, getToolName } from "ai";
import { Component, type ReactNode } from "react";
import { Bot, User, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Renderer } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { ToolInvocationRenderer } from "./chat/tool-invocation-renderer";

// Error boundary to prevent one broken part from crashing the whole message
class PartErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.fallback;
    return this.props.children;
  }
  private get fallback() {
    return this.props.fallback;
  }
}

// Strip ```openui ... ``` code fences if present, return the inner content
function stripOpenUIFence(text: string): string {
  // Accept ```openui or ```openui-lang
  const fenceMatch = text.match(/^```openui(?:-lang)?\s*\n([\s\S]*?)(?:\n```\s*)?$/m);
  if (fenceMatch) return fenceMatch[1];
  const openFence = text.match(/^```openui(?:-lang)?\s*\n([\s\S]*)$/m);
  if (openFence) return openFence[1];
  return text;
}

// Heuristic check: does the text look like openui-lang (starts with an assignment)?
function looksLikeOpenUI(text: string): boolean {
  const trimmed = stripOpenUIFence(text).trimStart();
  // openui-lang starts with identifier = Expression (e.g. "root = Card(...)")
  return /^[a-zA-Z_]\w*\s*=\s*/.test(trimmed);
}

// Detect raw JSON blobs that should be hidden in assistant messages.
// Must work during streaming when JSON is still incomplete.
function looksLikeRawJSON(text: string): boolean {
  let trimmed = text.trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)(?:\n```\s*)?$/m);
  if (fenced) trimmed = fenced[1].trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  // Check for JSON-like structure: looks like key-value pairs with quoted keys
  // This catches both complete and streaming (partial) JSON
  return /^\{\s*"[^"]+"\s*:/.test(trimmed) || /^\[\s*\{/.test(trimmed);
}

/** Convert camelCase or snake_case tool name to a human-readable label. */
function humanizeToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
  compact?: boolean;
  addToolResult?: (args: { tool: string; toolCallId: string; output: unknown }) => void;
  onAction?: (event: { type: string; params: Record<string, any>; humanFriendlyMessage: string; formState?: Record<string, any> }) => void;
}

export function ChatMessage({ message, isStreaming, compact, addToolResult, onAction }: ChatMessageProps) {
  const isUser = message.role === "user";
  const t = useTranslations("toolRenderer");

  // Collect unique tool names that completed (for the trace footer)
  const toolsUsed = !isUser
    ? Array.from(
        new Set(
          (message.parts ?? [])
            .filter((p) => isToolUIPart(p) && (p as any).state === "output-available")
            .map((p) => humanizeToolName(getToolName(p as any))),
        ),
      )
    : [];

  // Token usage embedded by the server in message.metadata
  const usage = !isUser
    ? (message.metadata as { inputTokens?: number; outputTokens?: number } | undefined)
    : undefined;

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} w-full`}>
      <Avatar className={`${compact ? "size-6" : "size-8"} shrink-0`}>
        <AvatarFallback
          className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}
        >
          {isUser ? <User className={compact ? "size-3" : "size-4"} /> : <Bot className={compact ? "size-3" : "size-4"} />}
        </AvatarFallback>
      </Avatar>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${compact ? "text-xs" : "text-sm"} ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            if (!part.text?.trim()) return null;
            // Always hide raw JSON blobs in assistant messages
            if (!isUser && looksLikeRawJSON(part.text)) {
              return null;
            }
            if (isUser) {
              return (
                <p key={i} className="whitespace-pre-wrap leading-relaxed">
                  {part.text}
                </p>
              );
            }
            // Try OpenUI renderer for openui-lang, fall back to plain text
            if (looksLikeOpenUI(part.text)) {
              const openUISource = stripOpenUIFence(part.text);
              return (
                <PartErrorBoundary
                  key={i}
                  fallback={
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {part.text}
                    </p>
                  }
                >
                  <Renderer
                    library={openuiChatLibrary}
                    response={openUISource}
                    isStreaming={isStreaming ?? false}
                    onAction={onAction}
                  />
                </PartErrorBoundary>
              );
            }
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                {part.text}
              </p>
            );
          }
          if (isToolUIPart(part) && addToolResult) {
            return (
              <div key={i} className="mt-2 -mx-2">
                <PartErrorBoundary
                  key={i}
                  fallback={
                    <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
                      {t("renderError")}
                    </div>
                  }
                >
                  <ToolInvocationRenderer
                    part={part}
                    addToolResult={addToolResult}
                  />
                </PartErrorBoundary>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>

      {/* Tool trace + token usage footer — assistant messages only */}
      {!isUser && !isStreaming && (toolsUsed.length > 0 || usage?.outputTokens) && (
        <div className={`flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground/50 ${compact ? "pl-9" : "pl-11"}`}>
          {toolsUsed.length > 0 && (
            <>
              <Wrench className="size-3 shrink-0" />
              <span>{toolsUsed.join(" · ")}</span>
            </>
          )}
          {usage?.outputTokens != null && (
            <>
              {toolsUsed.length > 0 && <span className="opacity-40">·</span>}
              <span>
                {usage.inputTokens?.toLocaleString() ?? "?"} in · {usage.outputTokens.toLocaleString()} out
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
