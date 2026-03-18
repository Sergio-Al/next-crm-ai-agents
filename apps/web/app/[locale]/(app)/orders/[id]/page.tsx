"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ShoppingCart,
  DollarSign,
  User,
  CalendarDays,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  unitPrice: string;
  quantity: number;
  discountPct: string | null;
  lineTotal: string;
  notes: string | null;
}

interface OrderDetail {
  id: string;
  number: string;
  status: string;
  currency: string | null;
  subtotal: string;
  discountAmount: string | null;
  taxAmount: string | null;
  totalAmount: string;
  notes: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  items: OrderItem[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  shipped: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

function formatCurrency(val: string | null, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("orderDetail");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((json) => setOrder(json.data ?? null))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden flex items-center justify-center">
        <p className="text-neutral-400">{t("notFound")}</p>
      </div>
    );
  }

  const contactName = order.contact
    ? [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/orders"
            className="mt-1 p-2 rounded-xl hover:bg-neutral-800/60 transition-colors"
          >
            <ArrowLeft className="size-5 text-neutral-400" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <ShoppingCart className="size-6 text-orange-400 shrink-0" />
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {order.number}
              </h1>
              <Badge className={`${STATUS_COLORS[order.status] ?? ""} border`}>
                {t(`status${order.status.charAt(0).toUpperCase() + order.status.slice(1)}`)}
              </Badge>
            </div>
            {order.createdAt && (
              <p className="text-xs text-neutral-500 mt-1 ml-9">
                {t("created", { date: new Date(order.createdAt).toLocaleDateString() })}
              </p>
            )}
          </div>
        </div>

        {/* Metadata cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <DollarSign className="size-3.5" />
                {t("total")}
              </div>
              <p className="text-xl font-semibold text-white">
                {formatCurrency(order.totalAmount, order.currency)}
              </p>
              {order.discountAmount && parseFloat(order.discountAmount) > 0 && (
                <p className="text-xs text-neutral-500">
                  {t("discount")}: -{formatCurrency(order.discountAmount, order.currency)}
                </p>
              )}
              {order.taxAmount && parseFloat(order.taxAmount) > 0 && (
                <p className="text-xs text-neutral-500">
                  {t("tax")}: +{formatCurrency(order.taxAmount, order.currency)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <Package className="size-3.5" />
                {t("items")}
              </div>
              <p className="text-xl font-semibold text-white">
                {order.items.length}
              </p>
              <p className="text-xs text-neutral-500">
                {t("subtotal")}: {formatCurrency(order.subtotal, order.currency)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <User className="size-3.5" />
                {t("contact")}
              </div>
              {contactName ? (
                <Link
                  href={`/contacts/${order.contact!.id}`}
                  className="text-xl font-semibold text-orange-400 hover:text-orange-300 transition-colors truncate block"
                >
                  {contactName}
                </Link>
              ) : (
                <p className="text-xl font-semibold text-neutral-500">
                  {t("noContact")}
                </p>
              )}
              {order.contact?.email && (
                <p className="text-xs text-neutral-500 truncate">
                  {order.contact.email}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <CalendarDays className="size-3.5" />
                {t("timeline")}
              </div>
              <div className="space-y-1 text-sm">
                {order.confirmedAt && (
                  <p className="text-blue-400">
                    {t("confirmedAt", { date: new Date(order.confirmedAt).toLocaleDateString() })}
                  </p>
                )}
                {order.shippedAt && (
                  <p className="text-amber-400">
                    {t("shippedAt", { date: new Date(order.shippedAt).toLocaleDateString() })}
                  </p>
                )}
                {order.deliveredAt && (
                  <p className="text-emerald-400">
                    {t("deliveredAt", { date: new Date(order.deliveredAt).toLocaleDateString() })}
                  </p>
                )}
                {order.cancelledAt && (
                  <p className="text-red-400">
                    {t("cancelledAt", { date: new Date(order.cancelledAt).toLocaleDateString() })}
                  </p>
                )}
                {!order.confirmedAt && !order.cancelledAt && (
                  <p className="text-neutral-500">{t("pending")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items table */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">{t("orderItems")}</h2>
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("headerProduct")}</TableHead>
                  <TableHead>{t("headerSku")}</TableHead>
                  <TableHead className="text-right">{t("headerUnitPrice")}</TableHead>
                  <TableHead className="text-right">{t("headerQty")}</TableHead>
                  <TableHead className="text-right">{t("headerDiscount")}</TableHead>
                  <TableHead className="text-right">{t("headerLineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="size-4 text-violet-400 shrink-0" />
                        <span className="font-medium">{item.productName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.productSku ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unitPrice, order.currency)}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.discountPct && parseFloat(item.discountPct) > 0
                        ? `${item.discountPct}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.lineTotal, order.currency)}
                    </TableCell>
                  </TableRow>
                ))}
                {order.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noItems")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">{t("notes")}</h2>
            <p className="text-neutral-300 leading-relaxed">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Floating AI chat */}
      <AiChatSheet
        context={{ type: "order", id: order.id, label: order.number }}
      />
    </div>
  );
}
