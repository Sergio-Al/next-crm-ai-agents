"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquareDashed,
  Send,
  Square,
  Users,
  Handshake,
  Zap,
  BarChart2,
  Search,
  Activity,
  CalendarPlus,
  UserPlus,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { ChatMessage } from "./chat-message";
import type { Message } from "ai";

const SUGGESTION_KEYS = [
  { key: "suggestSearchContacts", descKey: "suggestSearchContactsDesc", promptKey: "suggestSearchContactsPrompt", icon: Search, accent: true },
  { key: "suggestViewDeals", descKey: "suggestViewDealsDesc", promptKey: "suggestViewDealsPrompt", icon: Handshake, accent: true },
  { key: "suggestPipeline", descKey: "suggestPipelineDesc", promptKey: "suggestPipelinePrompt", icon: BarChart2, accent: true },
  { key: "suggestCreateContact", descKey: "suggestCreateContactDesc", promptKey: "suggestCreateContactPrompt", icon: UserPlus, accent: false },
  { key: "suggestFollowUp", descKey: "suggestFollowUpDesc", promptKey: "suggestFollowUpPrompt", icon: CalendarPlus, accent: false },
  { key: "suggestSessionStatus", descKey: "suggestSessionStatusDesc", promptKey: "suggestSessionStatusPrompt", icon: Activity, accent: false },
] as const;

interface ChatPanelProps {
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
}

export function ChatPanel({
  conversationId,
  onConversationCreated,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(
    conversationId ?? null,
  );
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const titleGenerated = useRef(false);
  const t = useTranslations("chat");
  const locale = useLocale();

  // Load history when conversationId changes
  useEffect(() => {
    titleGenerated.current = false;
    if (conversationId) {
      setActiveConvId(conversationId);
      setLoadingHistory(true);
      fetch(`/api/conversations/${conversationId}`)
        .then((r) => r.json())
        .then((data) => {
          setInitialMessages(data.data ?? []);
        })
        .catch(() => setInitialMessages([]))
        .finally(() => setLoadingHistory(false));
    } else {
      setActiveConvId(null);
      setInitialMessages([]);
    }
  }, [conversationId]);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop,
    append,
    addToolResult,
  } = useChat({
    api: "/api/chat",
    body: { conversationId: activeConvId, locale },
    initialMessages,
    key: conversationId ?? "new",
    onResponse: (response) => {
      const convId = response.headers.get("X-Conversation-Id");
      if (convId && !activeConvId) {
        setActiveConvId(convId);
        onConversationCreated?.(convId);
      }
    },
    onFinish: () => {
      // Generate title after first exchange
      if (activeConvId && !titleGenerated.current && messages.length >= 1) {
        titleGenerated.current = true;
        const firstUserMsg = messages.find((m) => m.role === "user");
        if (firstUserMsg) {
          generateTitle(activeConvId, firstUserMsg.content);
        }
      }
    },
  });

  const handleAction = useCallback(
    (event: { type: string; params: Record<string, any>; humanFriendlyMessage: string; formState?: Record<string, any> }) => {
      if (event.type === "continue_conversation") {
        append({ role: "user", content: event.humanFriendlyMessage });
      } else if (event.type === "open_url" && event.params.url) {
        window.open(event.params.url, "_blank", "noopener");
      }
    },
    [append],
  );

  const handleSuggestionClick = useCallback(
    (promptKey: string) => {
      const prompt = t(promptKey as any);
      handleInputChange({
        target: { value: prompt },
      } as React.ChangeEvent<HTMLInputElement>);
    },
    [handleInputChange, t],
  );

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden shadow-2xl shadow-black/50">
      {/* Radial glow background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-800/20 via-neutral-900/0 to-transparent pointer-events-none" />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col items-center p-8 relative z-10"
      >
        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            <span className="animate-pulse">{t("loadingConversation")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <div className="w-16 h-16 rounded-3xl bg-neutral-800/50 border border-white/5 flex items-center justify-center mb-6 shadow-inner shadow-white/5">
              <MessageSquareDashed
                strokeWidth={1.5}
                className="size-8 text-neutral-400"
              />
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-white mb-3 text-center">
              {t("heading")}
            </h1>
            <p className="text-base text-neutral-400 mb-10 text-center max-w-md">
              {t("description")}
            </p>

            {/* Suggestions Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 w-full max-w-4xl">
              {SUGGESTION_KEYS.map((tag) => (
                <button
                  key={tag.key}
                  onClick={() => handleSuggestionClick(tag.promptKey)}
                  className="flex flex-col items-start p-4 rounded-2xl bg-neutral-800/30 border border-white/5 hover:bg-neutral-800/60 hover:border-white/10 transition-all duration-300 group text-left relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-neutral-900 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                      <tag.icon
                        strokeWidth={1.5}
                        className={`size-4 ${tag.accent ? "text-orange-400" : "text-neutral-300"}`}
                      />
                    </div>
                    <span className="text-base font-medium text-neutral-200 tracking-tight group-hover:text-white transition-colors">
                      {t(tag.key)}
                    </span>
                  </div>
                  <span className="text-sm text-neutral-500 group-hover:text-neutral-400 transition-colors pl-11">
                    {t(tag.descKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl space-y-4">
            {messages.map((message, idx) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={isLoading && idx === messages.length - 1 && message.role === "assistant"}
                addToolResult={addToolResult}
                onAction={handleAction}
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm">
                  <span className="animate-pulse">{t("thinking")}</span>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 pt-0 w-full max-w-5xl mx-auto relative z-10">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-end bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 pl-5 focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5 transition-all shadow-lg shadow-black/20">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder={t("inputPlaceholder")}
              disabled={isLoading}
              className="flex-1 bg-transparent border-none outline-none text-base text-neutral-100 placeholder-neutral-500 py-3 resize-none"
            />
            <div className="flex items-center gap-2 pb-1 pr-1 pl-3">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white p-2.5 rounded-2xl transition-all duration-300 flex-shrink-0 border border-red-500/20"
                >
                  <Square className="size-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white p-2.5 rounded-2xl transition-all duration-300 flex-shrink-0 border border-orange-500/20 group disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Send
                    strokeWidth={1.5}
                    className="size-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                  />
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="text-center mt-3">
          <span className="text-xs text-neutral-600">
            {t("disclaimer")}
          </span>
        </div>
      </div>
    </div>
  );
}

async function generateTitle(conversationId: string, firstMessage: string) {
  try {
    const title =
      firstMessage.length > 60
        ? firstMessage.slice(0, 57) + "..."
        : firstMessage;
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch {
    // Ignore title generation failures
  }
}
