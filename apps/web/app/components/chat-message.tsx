import type { Message } from "ai";
import { Component, type ReactNode } from "react";
import { Bot, User } from "lucide-react";
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

// Heuristic check: does the text look like openui-lang (starts with an assignment)?
function looksLikeOpenUI(text: string): boolean {
  const trimmed = text.trimStart();
  // openui-lang starts with identifier = Expression (e.g. "root = Card(...)")
  return /^[a-zA-Z_]\w*\s*=\s*/.test(trimmed);
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  addToolResult?: (args: { toolCallId: string; result: unknown }) => void;
  onAction?: (event: { type: string; params: Record<string, any>; humanFriendlyMessage: string; formState?: Record<string, any> }) => void;
}

export function ChatMessage({ message, isStreaming, addToolResult, onAction }: ChatMessageProps) {
  const isUser = message.role === "user";
  const t = useTranslations("toolRenderer");

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback
          className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}
        >
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            if (!part.text?.trim()) return null;
            if (isUser) {
              return (
                <p key={i} className="whitespace-pre-wrap leading-relaxed">
                  {part.text}
                </p>
              );
            }
            // Try OpenUI renderer for openui-lang, fall back to plain text
            if (looksLikeOpenUI(part.text)) {
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
                    response={part.text}
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
          if (part.type === "tool-invocation" && addToolResult) {
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
                    toolInvocation={part.toolInvocation}
                    addToolResult={addToolResult}
                  />
                </PartErrorBoundary>
              </div>
            );
          }
          return null;
        }) ?? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
      </div>
    </div>
  );
}
