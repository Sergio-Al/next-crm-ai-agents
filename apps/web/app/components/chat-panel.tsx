"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  ShoppingCart,
  Package,
  Building2,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { ChatMessage } from "./chat-message";
import type { UIMessage } from "ai";
import {
  buildChatDrawerHref,
  getDrawerTargetFromUrl,
  getEntityPageHref,
  isChatPath,
} from "@/lib/chat-entity-navigation";

export interface ChatContext {
  type: "deal" | "contact" | "order" | "account";
  id: string;
  label: string;
}

type SuggestionKey = {
  key: string;
  descKey: string;
  promptKey: string;
  icon: React.ComponentType<{ strokeWidth?: number; className?: string }>;
  accent: boolean;
};

const SUGGESTION_KEYS: SuggestionKey[] = [
  { key: "suggestSearchContacts", descKey: "suggestSearchContactsDesc", promptKey: "suggestSearchContactsPrompt", icon: Search, accent: true },
  { key: "suggestViewDeals", descKey: "suggestViewDealsDesc", promptKey: "suggestViewDealsPrompt", icon: Handshake, accent: true },
  { key: "suggestPipeline", descKey: "suggestPipelineDesc", promptKey: "suggestPipelinePrompt", icon: BarChart2, accent: true },
  { key: "suggestCreateContact", descKey: "suggestCreateContactDesc", promptKey: "suggestCreateContactPrompt", icon: UserPlus, accent: false },
  { key: "suggestFollowUp", descKey: "suggestFollowUpDesc", promptKey: "suggestFollowUpPrompt", icon: CalendarPlus, accent: false },
  { key: "suggestSessionStatus", descKey: "suggestSessionStatusDesc", promptKey: "suggestSessionStatusPrompt", icon: Activity, accent: false },
];

const DEAL_SUGGESTION_KEYS: SuggestionKey[] = [
  { key: "suggestDealSummary", descKey: "suggestDealSummaryDesc", promptKey: "suggestDealSummaryPrompt", icon: BarChart2, accent: true },
  { key: "suggestDealRisk", descKey: "suggestDealRiskDesc", promptKey: "suggestDealRiskPrompt", icon: Activity, accent: true },
  { key: "suggestDealFollowUp", descKey: "suggestDealFollowUpDesc", promptKey: "suggestDealFollowUpPrompt", icon: CalendarPlus, accent: false },
  { key: "suggestDealMoveStage", descKey: "suggestDealMoveStageDesc", promptKey: "suggestDealMoveStagePrompt", icon: Handshake, accent: false },
  { key: "suggestDealNurture", descKey: "suggestDealNurtureDesc", promptKey: "suggestDealNurturePrompt", icon: Zap, accent: false },
];

const CONTACT_SUGGESTION_KEYS: SuggestionKey[] = [
  { key: "suggestContactSummary", descKey: "suggestContactSummaryDesc", promptKey: "suggestContactSummaryPrompt", icon: Users, accent: true },
  { key: "suggestContactDeals", descKey: "suggestContactDealsDesc", promptKey: "suggestContactDealsPrompt", icon: Handshake, accent: true },
  { key: "suggestContactEmail", descKey: "suggestContactEmailDesc", promptKey: "suggestContactEmailPrompt", icon: Search, accent: false },
  { key: "suggestContactFollowUp", descKey: "suggestContactFollowUpDesc", promptKey: "suggestContactFollowUpPrompt", icon: CalendarPlus, accent: false },
  { key: "suggestContactNurture", descKey: "suggestContactNurtureDesc", promptKey: "suggestContactNurturePrompt", icon: Zap, accent: false },
];

const ORDER_SUGGESTION_KEYS: SuggestionKey[] = [
  { key: "suggestOrderSummary", descKey: "suggestOrderSummaryDesc", promptKey: "suggestOrderSummaryPrompt", icon: ShoppingCart, accent: true },
  { key: "suggestOrderProducts", descKey: "suggestOrderProductsDesc", promptKey: "suggestOrderProductsPrompt", icon: Package, accent: true },
  { key: "suggestOrderStatus", descKey: "suggestOrderStatusDesc", promptKey: "suggestOrderStatusPrompt", icon: Activity, accent: false },
  { key: "suggestOrderFollowUp", descKey: "suggestOrderFollowUpDesc", promptKey: "suggestOrderFollowUpPrompt", icon: CalendarPlus, accent: false },
];

const ACCOUNT_SUGGESTION_KEYS: SuggestionKey[] = [
  { key: "suggestAccountSummary", descKey: "suggestAccountSummaryDesc", promptKey: "suggestAccountSummaryPrompt", icon: Building2, accent: true },
  { key: "suggestAccountPeers", descKey: "suggestAccountPeersDesc", promptKey: "suggestAccountPeersPrompt", icon: Users, accent: true },
  { key: "suggestAccountProducts", descKey: "suggestAccountProductsDesc", promptKey: "suggestAccountProductsPrompt", icon: Package, accent: false },
  { key: "suggestAccountFollowUp", descKey: "suggestAccountFollowUpDesc", promptKey: "suggestAccountFollowUpPrompt", icon: CalendarPlus, accent: false },
];

interface ChatPanelProps {
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  context?: ChatContext | null;
  compact?: boolean;
}

export function ChatPanel({
  conversationId,
  onConversationCreated,
  context,
  compact,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [activeConvId, setActiveConvId] = useState<string | null>(
    conversationId ?? null,
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const titleGenerated = useRef(false);
  const t = useTranslations("chat");
  const tAi = useTranslations("aiChat");
  const locale = useLocale();

  const [input, setInput] = useState('');
  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          conversationId: activeConvIdRef.current,
          locale,
          ...(context ? { context: { type: context.type, id: context.id } } : {}),
        }),
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const response = await globalThis.fetch(url, init);
          const convId = response.headers.get("X-Conversation-Id");
          if (convId && !activeConvIdRef.current) {
            setActiveConvId(convId);
            onConversationCreated?.(convId);
          }
          return response;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, context?.type, context?.id],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    addToolResult,
  } = useChat({
    id: conversationId ?? "new",
    transport,
    onFinish: () => {
      // Generate title after first exchange
      if (activeConvIdRef.current && !titleGenerated.current && messages.length >= 1) {
        titleGenerated.current = true;
        const firstUserMsg = messages.find((m) => m.role === "user");
        if (firstUserMsg) {
          const text = firstUserMsg.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");
          generateTitle(activeConvIdRef.current, text);
        }
      }
    },
  });

  // Load history when conversationId changes
  useEffect(() => {
    titleGenerated.current = false;
    if (conversationId) {
      setActiveConvId(conversationId);
      setLoadingHistory(true);
      fetch(`/api/conversations/${conversationId}`)
        .then((r) => r.json())
        .then((data) => {
          setMessages(data.data ?? []);
        })
        .catch(() => setMessages([]))
        .finally(() => setLoadingHistory(false));
    } else {
      setActiveConvId(null);
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = input.trim();
      if (!text) return;
      setInput("");
      sendMessage({ text });
    },
    [input, sendMessage],
  );

  const handleAction = useCallback(
    (event: { type: string; params: Record<string, any>; humanFriendlyMessage: string; formState?: Record<string, any> }) => {
      if (event.type === "continue_conversation") {
        sendMessage({ text: event.humanFriendlyMessage });
      } else if (event.type === "open_url" && event.params.url) {
        const url = new URL(String(event.params.url), window.location.href);
        const drawerTarget = getDrawerTargetFromUrl(url);

        if (drawerTarget && isChatPath(pathname) && url.origin === window.location.origin) {
          if (window.matchMedia("(max-width: 767px)").matches) {
            router.push(getEntityPageHref(pathname, drawerTarget.type, drawerTarget.id));
            return;
          }

          const href = buildChatDrawerHref({
            pathname,
            conversationId: activeConvIdRef.current,
            drawerType: drawerTarget.type,
            drawerId: drawerTarget.id,
          });
          router.push(href);
          return;
        }

        if (url.origin === window.location.origin) {
          router.push(`${url.pathname}${url.search}${url.hash}`);
          return;
        }

        window.open(event.params.url, "_blank", "noopener");
      }
    },
    [pathname, router, sendMessage],
  );

  const activeSuggestions = context
    ? context.type === "deal"
      ? DEAL_SUGGESTION_KEYS
      : context.type === "order"
        ? ORDER_SUGGESTION_KEYS
        : context.type === "account"
          ? ACCOUNT_SUGGESTION_KEYS
          : CONTACT_SUGGESTION_KEYS
    : SUGGESTION_KEYS;

  const handleSuggestionClick = useCallback(
    (promptKey: string) => {
      const prompt = context ? tAi(promptKey as any) : t(promptKey as any);
      setInput(prompt);
    },
    [t, tAi, context],
  );

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className={`flex flex-col h-full bg-card ${compact ? "rounded-none border-0" : "rounded-[2rem] border border-border"} relative overflow-hidden`}>
      {/* Radial glow background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sidebar-accent/30 via-transparent to-transparent pointer-events-none" />
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col items-center p-8 relative z-10"
      >
        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <span className="animate-pulse">{t("loadingConversation")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <div className="w-16 h-16 rounded-3xl bg-muted border border-border flex items-center justify-center mb-6">
              <MessageSquareDashed
                strokeWidth={1.5}
                className="size-8 text-muted-foreground"
              />
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-foreground mb-3 text-center">
              {t("heading")}
            </h1>
            <p className="text-base text-muted-foreground mb-10 text-center max-w-md">
              {t("description")}
            </p>

            {/* Suggestions Bento Grid */}
            <div className={`grid gap-3 w-full ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"} max-w-4xl`}>
              {activeSuggestions.map((tag) => (
                <button
                  key={tag.key}
                  onClick={() => handleSuggestionClick(tag.promptKey)}
                  className="flex flex-col items-start p-4 rounded-2xl bg-muted/40 border border-border hover:bg-muted hover:border-border/80 transition-all duration-300 group text-left relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-background border border-border group-hover:scale-105 transition-transform duration-300">
                      <tag.icon
                        strokeWidth={1.5}
                        className={`size-4 ${tag.accent ? "text-primary" : "text-muted-foreground"}`}
                      />
                    </div>
                    <span className="text-base font-medium text-secondary-foreground tracking-tight group-hover:text-foreground transition-colors">
                      {context ? tAi(tag.key as any) : t(tag.key as any)}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-muted-foreground/80 transition-colors pl-11">
                    {context ? tAi(tag.descKey as any) : t(tag.descKey as any)}
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
                compact={compact}
                isStreaming={isLoading && idx === messages.length - 1 && message.role === "assistant"}
                addToolResult={addToolResult}
                onAction={handleAction}
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span className="animate-pulse">{t("thinking")}</span>
                </div>
              )}
          </div>
        )}
      </div>
      {/* Input Area */}
      <div className="p-6 pt-0 w-full max-w-5xl mx-auto relative z-10">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-end bg-input border border-border rounded-3xl p-2 pl-5 focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/10 transition-all">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={t("inputPlaceholder")}
              disabled={isLoading}
              className="flex-1 bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground py-3 resize-none"
            />
            <div className="flex items-center gap-2 pb-1 pr-1 pl-3">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground p-2.5 rounded-2xl transition-all duration-300 flex-shrink-0 border border-destructive/20"
                >
                  <Square className="size-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground p-2.5 rounded-2xl transition-all duration-300 flex-shrink-0 border border-primary/20 group disabled:opacity-30 disabled:pointer-events-none"
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
          <span className="text-xs text-muted-foreground/60">
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
