"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Building2,
  CalendarDays,
  Globe,
  Hash,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatEntityLink } from "./chat-entity-link";

interface AccountContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

interface AccountOrder {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  currency: string | null;
  itemCount: number;
  createdAt: string | null;
  regionCode?: string | null;
}

interface AccountDetail {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  sapAccountId: string | null;
  tags: string[] | null;
  createdAt: string | null;
  contacts: AccountContact[];
  orders: AccountOrder[];
  stats: {
    orderCount: number;
    totalRevenue: string;
    lastOrderAt: string | null;
    orderTrend: Array<{ date: string; count: number; revenue: string }>;
    orderDeltaPct: number;
    revenueDeltaPct: number;
  } | null;
}

function formatCurrency(value: string | null | undefined, currency: string | null) {
  if (!value) return "—";
  const number = parseFloat(value);
  if (Number.isNaN(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 0,
  }).format(number);
}

export function AccountDrawerContent({
  accountId,
  onOpenFullPage,
}: {
  accountId: string;
  onOpenFullPage?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("accountDetail");
  const drawerT = useTranslations("aiChat");
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounts/${accountId}`)
      .then((response) => response.json())
      .then((json) => setAccount(json.data ?? null))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, [accountId]);

  const initials = useMemo(() => {
    if (!account?.name) return "?";
    return (
      account.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((value) => value[0])
        .join("")
        .toUpperCase() || "?"
    );
  }, [account?.name]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (!account) {
    return <div className="p-4 text-sm text-muted-foreground">{t("notFound")}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{account.name}</h2>
              {account.industry && <Badge variant="secondary">{account.industry}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {account.sapAccountId && (
                <span className="inline-flex items-center gap-1">
                  <Hash className="size-3" />
                  {t("sapPrefix")} {account.sapAccountId}
                </span>
              )}
              {account.website && (
                <a
                  href={account.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Globe className="size-3" />
                  <span className="truncate">{account.website}</span>
                </a>
              )}
              {account.createdAt && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {new Date(account.createdAt).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onOpenFullPage}>
            {drawerT("openFullPage")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShoppingCart className="size-3.5" />
              {t("statOrders")}
            </div>
            <div className="mt-2 text-xl font-semibold">{account.stats?.orderCount ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" />
              {t("statRevenue")}
            </div>
            <div className="mt-2 text-sm font-semibold truncate">
              {formatCurrency(account.stats?.totalRevenue, "USD")}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {t("statContacts")}
            </div>
            <div className="mt-2 text-xl font-semibold">{account.contacts.length}</div>
          </div>
        </div>

        {account.tags && account.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {account.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" />
            {t("sectionContacts", { count: account.contacts.length })}
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            {account.contacts.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t("statContactsLinked")}</div>
            ) : (
              account.contacts.map((contact) => {
                const label = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
                return (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <ChatEntityLink
                        type="contact"
                        entityId={contact.id}
                        mode="replace"
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {label}
                      </ChatEntityLink>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {contact.email ?? contact.phone ?? drawerT("noSecondaryInfo")}
                      </div>
                    </div>
                    <ChatEntityLink
                      type="contact"
                      entityId={contact.id}
                      mode="replace"
                      className="text-xs font-medium text-primary hover:underline shrink-0"
                    >
                      {drawerT("openContact")}
                    </ChatEntityLink>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart className="size-4 text-primary" />
            {t("recentOrders")}
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            {account.orders.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t("recentOrdersSubtitle", { count: 0 })}</div>
            ) : (
              account.orders.slice(0, 8).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div>
                    <div className="font-medium text-sm">#{order.number}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="capitalize">{order.status}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
