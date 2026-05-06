"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30_000;

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setCount(data.count ?? 0);
    } catch {
      // ignore transient errors
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setItems(data.notifications ?? []);
      setCount(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling fallback
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Refresh on SSE event from NotificationStreamProvider
  useEffect(() => {
    const handler = () => {
      refreshCount();
      if (open) loadList();
    };
    window.addEventListener("notifications:refresh", handler);
    return () => window.removeEventListener("notifications:refresh", handler);
  }, [open, refreshCount, loadList]);

  // Refresh "X ago" timestamps every 30s while open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // Load list when opened
  useEffect(() => {
    if (open) {
      setNow(Date.now());
      loadList();
    }
  }, [open, loadList]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      // Optimistic
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setCount((c) => Math.max(0, c - 1));
      try {
        await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      } catch {
        refreshCount();
      }
    },
    [refreshCount],
  );

  const handleMarkAll = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      refreshCount();
    }
  }, [refreshCount]);

  const handleClickRow = useCallback(
    async (n: Notification) => {
      if (!n.read) await handleMarkRead(n.id);
      if (n.link) {
        setOpen(false);
        router.push(n.link as never);
      }
    },
    [handleMarkRead, router],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={t("aria")}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <Bell strokeWidth={1.5} className="size-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 max-h-[28rem] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium">{t("title")}</span>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={count === 0}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="size-3.5" />
            {t("markAllRead")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClickRow(n)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-2",
                      !n.read && "bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 rounded-full flex-shrink-0",
                        n.read ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatRelative(n.createdAt, now)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(n.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMarkRead(n.id);
                          }
                        }}
                        aria-label={t("markRead")}
                        className="mt-0.5 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
