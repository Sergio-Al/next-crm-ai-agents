"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Mail, Phone, Building2, Tag, Handshake, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AiChatSheet } from "@/components/ai-chat-sheet";
import { PeersCard } from "@/components/peers-card";

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

function formatCurrency(val: string | null, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("contactDetail");
  const locale = useLocale();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then((r) => r.json())
      .then((json) => setContact(json.data ?? null))
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden flex items-center justify-center">
        <p className="text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
  const initials = [contact.firstName?.[0], contact.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/contacts"
            className="mt-1 p-2 rounded-xl hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft className="size-5 text-muted-foreground" />
          </Link>
          <Avatar className="size-12">
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {fullName}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {contact.source && (
                <Badge variant="secondary" className="text-xs">
                  {contact.source}
                </Badge>
              )}
              {contact.createdAt && (
                <span className="text-xs text-muted-foreground">
                  {t("created", { date: new Date(contact.createdAt).toLocaleDateString() })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {contact.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              {contact.email}
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="size-4 text-muted-foreground shrink-0" />
              {contact.phone}
            </div>
          )}
          {contact.companyName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="size-4 text-muted-foreground shrink-0" />
              {contact.companyName}
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="size-4 text-muted-foreground" />
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Related deals */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            {t("relatedDeals")} ({contact.deals.length})
          </h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dealTitle")}</TableHead>
                  <TableHead>{t("dealValue")}</TableHead>
                  <TableHead>{t("dealStage")}</TableHead>
                  <TableHead>{t("dealStatus")}</TableHead>
                  <TableHead>{t("dealClose")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contact.deals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/deals/${deal.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary transition-colors"
                      >
                        <Handshake className="size-4 text-primary shrink-0" />
                        {deal.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(deal.value, deal.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deal.stageName ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>{deal.status}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.expectedClose ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {contact.deals.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-20 text-center text-muted-foreground"
                    >
                      {t("noDeals")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Related orders */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            {t("relatedOrders")} ({contact.orders.length})
          </h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orderNumber")}</TableHead>
                  <TableHead>{t("orderTotal")}</TableHead>
                  <TableHead>{t("orderItems")}</TableHead>
                  <TableHead>{t("orderStatus")}</TableHead>
                  <TableHead>{t("orderDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contact.orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/orders/${order.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary transition-colors"
                      >
                        <ShoppingCart className="size-4 text-primary shrink-0" />
                        {order.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(order.totalAmount, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {order.itemCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {contact.orders.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-20 text-center text-muted-foreground"
                    >
                      {t("noOrders")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Peers Also Bought */}
        {contact.accountId && (
          <PeersCard contactId={contact.id} locale={locale} />
        )}
      </div>

      {/* Floating AI chat */}
      <AiChatSheet context={{ type: "contact", id: contact.id, label: fullName }} />
    </div>
  );
}
