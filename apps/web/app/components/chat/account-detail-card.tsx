"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { Building2, Globe, Tag, TrendingUp, ShoppingBag, Users, DollarSign, Calendar } from "lucide-react";
import { ChatEntityLink } from "./chat-entity-link";

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  size: string | null;
  sapAccountId: string | null;
  tags: string[] | null;
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

interface Deal {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  status: string;
  stageName: string | null;
}

interface OrderStats {
  total: number;
  confirmedCount: number;
  totalRevenue: string;
  lastOrderAt: string | null;
}

interface RecentOrder {
  id: string;
  number: string;
  status: string;
  totalAmount: string | null;
  currency: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-500/10 text-green-400 border-green-500/20",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  shipped: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export function AccountDetailCard({
  account,
  contacts,
  deals,
  orderStats,
  recentOrders,
}: {
  account: Account;
  contacts: Contact[];
  deals: Deal[];
  orderStats: OrderStats | null;
  recentOrders: RecentOrder[];
}) {
  const t = useTranslations("accountDetail");

  const revenue = orderStats?.totalRevenue
    ? Number(orderStats.totalRevenue).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "0";

  const lastOrder = orderStats?.lastOrderAt
    ? new Date(orderStats.lastOrderAt).toLocaleDateString()
    : t("noOrders");

  return (
    <div className="rounded-md border bg-background/50 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Building2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <ChatEntityLink
            type="account"
            entityId={account.id}
            className="font-semibold text-sm truncate hover:text-primary transition-colors"
          >
            {account.name}
          </ChatEntityLink>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {account.industry && (
              <Badge variant="secondary" className="text-[10px]">
                {account.industry}
              </Badge>
            )}
            {account.size && (
              <Badge variant="outline" className="text-[10px]">
                {account.size}
              </Badge>
            )}
            {account.sapAccountId && (
              <span className="text-[10px] text-muted-foreground">SAP: {account.sapAccountId}</span>
            )}
          </div>
        </div>
      </div>

      {account.website && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="size-3" />
          <a href={account.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
            {account.website}
          </a>
        </div>
      )}

      {account.tags && account.tags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Tag className="size-3 text-muted-foreground" />
          <div className="flex gap-1 flex-wrap">
            {account.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-2">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
            <ShoppingBag className="size-3" />
            <span className="text-[10px]">{t("statOrders")}</span>
          </div>
          <div className="text-sm font-semibold">{orderStats?.confirmedCount ?? 0}</div>
        </div>
        <div className="text-center border-x">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
            <DollarSign className="size-3" />
            <span className="text-[10px]">{t("statRevenue")}</span>
          </div>
          <div className="text-sm font-semibold truncate">{revenue}</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
            <Calendar className="size-3" />
            <span className="text-[10px]">{t("statLastOrder")}</span>
          </div>
          <div className="text-xs font-medium truncate">{lastOrder}</div>
        </div>
      </div>

      {/* Contacts */}
      {contacts.length > 0 && (
        <div className="border-t pt-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <Users className="size-3" />
            {t("sectionContacts", { count: contacts.length })}
          </div>
          <div className="space-y-1">
            {contacts.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs py-0.5">
                <ChatEntityLink
                  type="contact"
                  entityId={c.id}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {c.firstName} {c.lastName}
                </ChatEntityLink>
                <span className="text-muted-foreground truncate ml-2">{c.email ?? c.phone ?? ""}</span>
              </div>
            ))}
            {contacts.length > 5 && (
              <div className="text-[10px] text-muted-foreground">{t("moreContacts", { count: contacts.length - 5 })}</div>
            )}
          </div>
        </div>
      )}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div className="border-t pt-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <TrendingUp className="size-3" />
            {t("sectionRecentOrders")}
          </div>
          <div className="space-y-1">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs py-0.5">
                <span className="font-medium">{o.number}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[o.status] ?? "bg-muted/30 text-muted-foreground border-muted"}`}
                  >
                    {o.status}
                  </span>
                  {o.totalAmount && (
                    <span className="text-muted-foreground">
                      {Number(o.totalAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deals */}
      {deals.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            {t("sectionDeals", { count: deals.length })}
          </div>
          {deals.slice(0, 3).map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs py-0.5">
              <span className="truncate">{d.title}</span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {d.stageName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {d.stageName}
                  </Badge>
                )}
                {d.value && (
                  <span className="text-muted-foreground flex items-center gap-0.5">
                    <DollarSign className="size-3" />
                    {Number(d.value).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
