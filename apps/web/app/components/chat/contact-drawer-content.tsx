"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Mail, Phone, ShoppingCart, Handshake } from "lucide-react";
import { ChatEntityLink } from "./chat-entity-link";

interface ContactDeal {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  status: string;
  expectedClose: string | null;
  stageName: string | null;
}

interface ContactOrder {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  currency: string | null;
  itemCount: number;
  createdAt: string | null;
}

interface ContactDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  tags: string[] | null;
  accountId: string | null;
  createdAt: string | null;
  deals: ContactDeal[];
  orders: ContactOrder[];
}

function formatCurrency(value: string | null, currency: string | null) {
  if (!value) return "—";
  const number = parseFloat(value);
  if (Number.isNaN(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 0,
  }).format(number);
}

export function ContactDrawerContent({
  contactId,
  onOpenFullPage,
}: {
  contactId: string;
  onOpenFullPage?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("contactDetail");
  const drawerT = useTranslations("aiChat");
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/contacts/${contactId}`)
      .then((response) => response.json())
      .then((json) => setContact(json.data ?? null))
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!contact) {
    return <div className="p-4 text-sm text-muted-foreground">{t("notFound")}</div>;
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
  const initials = ([contact.firstName?.[0], contact.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?") as string;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold truncate">{fullName}</h2>
              {contact.source && <Badge variant="secondary">{contact.source}</Badge>}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
              {contact.email && (
                <div className="inline-flex items-center gap-1.5 truncate">
                  <Mail className="size-3" />
                  {contact.email}
                </div>
              )}
              {contact.phone && (
                <div className="inline-flex items-center gap-1.5 truncate">
                  <Phone className="size-3" />
                  {contact.phone}
                </div>
              )}
              {contact.accountId && contact.companyName && (
                <ChatEntityLink
                  type="account"
                  entityId={contact.accountId}
                  mode="replace"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Building2 className="size-3" />
                  {contact.companyName}
                </ChatEntityLink>
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
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Handshake className="size-4 text-primary" />
            {t("relatedDeals")} ({contact.deals.length})
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            {contact.deals.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t("noDeals")}</div>
            ) : (
              contact.deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{deal.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {deal.stageName ?? deal.status}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatCurrency(deal.value, deal.currency)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart className="size-4 text-primary" />
            {t("relatedOrders")} ({contact.orders.length})
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            {contact.orders.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t("noOrders")}</div>
            ) : (
              contact.orders.slice(0, 8).map((order) => (
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
