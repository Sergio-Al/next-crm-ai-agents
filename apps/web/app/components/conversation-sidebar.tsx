"use client";

import { useEffect, useState } from "react";
import { Plus, MessageSquare, PanelLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Props {
  activeId?: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  refreshKey?: number;
}

export function ConversationSidebar({
  activeId,
  onSelect,
  onNewChat,
  refreshKey,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("conversationSidebar");

  useEffect(() => {
    setLoading(true);
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setConversations(data.data ?? []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("justNow");
    if (mins < 60) return t("minutesAgo", { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("daysAgo", { count: days });
    return date.toLocaleDateString();
  };

  return (
    <aside className="w-80 flex-shrink-0 bg-neutral-900/40 rounded-[2rem] border border-white/5 flex-col p-4 hidden lg:flex relative overflow-hidden">
      {/* Subtle top glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="flex items-center justify-between mb-6 mt-1 px-2">
        <button className="text-neutral-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
          <PanelLeft strokeWidth={1.5} className="size-5" />
        </button>
      </div>

      <button
        onClick={onNewChat}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-100 text-neutral-900 hover:bg-white rounded-2xl text-base font-medium transition-all shadow-sm shadow-white/5 active:scale-[0.98] mb-6"
      >
        <Plus strokeWidth={1.5} className="size-4" />
        {t("newChat")}
      </button>

      <div className="flex-1 overflow-y-auto space-y-1 pr-2 -mr-2">
        {loading ? (
          <div className="p-4 text-center text-xs text-neutral-500">
            {t("loading")}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="size-6 mx-auto mb-2 text-neutral-600" />
            <p className="text-xs text-neutral-500">{t("empty")}</p>
          </div>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "w-full text-left p-3 rounded-2xl transition-all group",
                activeId === c.id
                  ? "bg-white/5 border border-white/5"
                  : "hover:bg-white/5 border border-transparent hover:border-white/5",
              )}
            >
              <h4
                className={cn(
                  "text-base font-medium mb-1 truncate transition-colors",
                  activeId === c.id
                    ? "text-neutral-100"
                    : "text-neutral-400 group-hover:text-neutral-200",
                )}
              >
                {c.title}
              </h4>
              <p
                className={cn(
                  "text-xs transition-colors",
                  activeId === c.id
                    ? "text-neutral-500"
                    : "text-neutral-600 group-hover:text-neutral-500",
                )}
              >
                {formatTime(c.updatedAt ?? c.createdAt)} &middot;{" "}
                {t("messages", { count: c.messageCount })}
              </p>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
