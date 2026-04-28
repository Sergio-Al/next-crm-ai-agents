"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  DollarSign,
  Handshake,
  Loader2,
  Package,
  ShoppingCart,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { AiChatSheet } from "@/components/ai-chat-sheet";
import { AccountStatCard } from "@/components/account-stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    accountId: string | null;
    dealId: string | null;
    contact: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
    items: OrderItem[];
  }

  interface CrossSellSuggestion {
    id: string;
    name: string;
    peerCount?: number;
    reason?: string;
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-muted/50 text-muted-foreground border-border",
    confirmed: "bg-info/10 text-info border-info/20",
    shipped: "bg-warning/10 text-warning border-warning/20",
    delivered: "bg-success/10 text-success border-success/20",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  };

  const STATUS_TRANSITIONS: Record<string, string[]> = {
    draft: ["confirmed", "cancelled"],
    confirmed: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
  };

  const STEPPER_STEPS = ["draft", "confirmed", "shipped", "delivered"] as const;

  function formatCurrency(val: string | null, cur: string | null) {
    if (!val) return "—";
    const num = parseFloat(val);
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur ?? "USD",
      minimumFractionDigits: 2,
    }).format(num);
  }

  function formatDate(val: string | null, locale: string) {
    if (!val) return null;
    return new Date(val).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getStatusLabel(t: ReturnType<typeof useTranslations>, status: string) {
    switch (status) {
      case "draft":
        return t("statusDraft");
      case "confirmed":
        return t("statusConfirmed");
      case "shipped":
        return t("statusShipped");
      case "delivered":
        return t("statusDelivered");
      case "cancelled":
        return t("statusCancelled");
      default:
        return status;
    }
  }

  function orderInitials(number: string) {
    const normalized = number.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return normalized.slice(0, 2) || "OR";
  }

  function StatusStepper({
    order,
    locale,
    t,
  }: {
    order: OrderDetail;
    locale: string;
    t: ReturnType<typeof useTranslations>;
  }) {
    const isCancelled = order.status === "cancelled";
    const currentIdx = STEPPER_STEPS.indexOf(order.status as (typeof STEPPER_STEPS)[number]);
    const stepDates: Record<string, string | null> = {
      draft: order.createdAt,
      confirmed: order.confirmedAt,
      shipped: order.shippedAt,
      delivered: order.deliveredAt,
    };

    return (
      <div className="flex items-start gap-0">
        {STEPPER_STEPS.map((step, idx) => {
          const isCompleted = !isCancelled && idx < currentIdx;
          const isCurrent = !isCancelled && idx === currentIdx;
          const date = stepDates[step];

          return (
            <div key={step} className="flex flex-1 items-start">
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 72 }}>
                <div
                  className={[
                    "size-8 rounded-full flex items-center justify-center border-2 transition-colors",
                    isCompleted
                      ? "bg-success/20 border-success text-success"
                      : isCurrent && isCancelled
                        ? "bg-destructive/20 border-destructive text-destructive"
                        : isCurrent
                          ? "bg-primary/20 border-primary text-primary ring-4 ring-primary/10"
                          : "bg-muted border-border text-muted-foreground",
                  ].join(" ")}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-4" />
                  ) : isCurrent && isCancelled ? (
                    <XCircle className="size-4" />
                  ) : isCurrent ? (
                    <Circle className="size-3 fill-current" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                </div>
                <span
                  className={[
                    "text-xs mt-1.5 font-medium text-center leading-tight",
                    isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {getStatusLabel(t, step)}
                </span>
                {date && (isCompleted || isCurrent) && (
                  <span className="text-[10px] text-muted-foreground mt-0.5 text-center">
                    {formatDate(date, locale)}
                  </span>
                )}
              </div>
              {idx < STEPPER_STEPS.length - 1 && (
                <div
                  className={[
                    "h-0.5 flex-1 mt-4 mx-1 transition-colors",
                    isCompleted ? "bg-success/60" : "bg-border",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
        {isCancelled && (
          <div className="flex items-center gap-2 ml-4 mt-2">
            <XCircle className="size-5 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              {getStatusLabel(t, "cancelled")}
              {order.cancelledAt ? ` · ${formatDate(order.cancelledAt, locale)}` : ""}
            </span>
          </div>
        )}
      </div>
    );
  }

  function CrossSellPanel({
    order,
    t,
    tc,
  }: {
    order: OrderDetail;
    t: ReturnType<typeof useTranslations>;
    tc: ReturnType<typeof useTranslations>;
  }) {
    const [suggestions, setSuggestions] = useState<CrossSellSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(() => {
      if (loaded) return;

      setLoading(true);
      const body: Record<string, unknown> = { limit: 5, explain: false };

      if (order.accountId) {
        body.accountId = order.accountId;
      } else if (order.contact?.id) {
        body.contactId = order.contact.id;
      } else {
        setLoading(false);
        setLoaded(true);
        return;
      }

      fetch("/api/orders/cross-sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((json) => setSuggestions(json.suggestions ?? []))
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          setLoaded(true);
        });
    }, [loaded, order.accountId, order.contact?.id]);

    useEffect(() => {
      load();
    }, [load]);

    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t("crossSell")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("crossSellDesc")}</p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3 animate-spin" />
              {tc("loading")}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t("crossSellEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="flex items-start gap-2">
                  <Package className="size-3.5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{suggestion.name}</p>
                    {suggestion.reason && (
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  export default function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const locale = useLocale();
    const t = useTranslations("orderDetail");
    const tc = useTranslations("common");
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [transitioning, setTransitioning] = useState(false);

    useEffect(() => {
      fetch(`/api/orders/${id}`)
        .then((r) => r.json())
        .then((json) => setOrder(json.data ?? null))
        .catch(() => setOrder(null))
        .finally(() => setLoading(false));
    }, [id]);

    const handleTransition = useCallback(async (newStatus: string) => {
      if (!order) return;

      setTransitioning(true);
      try {
        const res = await fetch(`/api/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });

        if (res.ok) {
          const json = await res.json();
          setOrder((prev) => (prev ? { ...prev, ...json.data } : prev));

          const refreshed = await fetch(`/api/orders/${id}`).then((r) => r.json());
          if (refreshed.data) {
            setOrder(refreshed.data);
          }
        }
      } finally {
        setTransitioning(false);
      }
    }, [id, order]);

    if (loading) {
      return (
        <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="p-6 space-y-6">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      );
    }

    if (!order) {
      return (
        <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden flex items-center justify-center">
          <div className="text-center space-y-3">
            <ShoppingCart className="size-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{t("notFound")}</p>
            <Link
              href="/orders"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              <ArrowLeft className="size-4 mr-2" />
              {t("back")}
            </Link>
          </div>
        </div>
      );
    }

    const contactName = order.contact
      ? [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ")
      : null;
    const validTransitions = STATUS_TRANSITIONS[order.status] ?? [];
    const transitionLabels: Record<string, string> = {
      confirmed: t("actionConfirm"),
      shipped: t("actionShip"),
      delivered: t("actionDeliver"),
      cancelled: t("actionCancel"),
    };

    return (
      <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <Link href="/orders" className="mt-1 p-2 rounded-xl hover:bg-muted/60 transition-colors">
                <ArrowLeft className="size-5 text-muted-foreground" />
              </Link>
              <Avatar className="size-12">
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {orderInitials(order.number)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{order.number}</h1>
                  <Badge className={`${STATUS_COLORS[order.status] ?? ""} border`}>
                    {getStatusLabel(t, order.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                  {order.createdAt && (
                    <span>{t("created", { date: formatDate(order.createdAt, locale) ?? tc("dash") })}</span>
                  )}
                  {contactName && order.contact && (
                    <Link
                      href={`/contacts/${order.contact.id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <User className="size-3" />
                      {contactName}
                    </Link>
                  )}
                  {order.dealId && (
                    <Link
                      href={`/deals/${order.dealId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Handshake className="size-3" />
                      {t("viewDeal")}
                    </Link>
                  )}
                  {order.accountId && (
                    <Link
                      href={`/accounts/${order.accountId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Building2 className="size-3" />
                      {t("viewAccount")}
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {validTransitions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {validTransitions.map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={next === "cancelled" ? "destructive" : "default"}
                    disabled={transitioning}
                    onClick={() => handleTransition(next)}
                  >
                    {transitioning && <Loader2 className="size-3 mr-1 animate-spin" />}
                    {transitionLabels[next] ?? next}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <AccountStatCard
              icon={DollarSign}
              label={t("total")}
              value={formatCurrency(order.totalAmount, order.currency)}
              fallbackBadge={order.currency ?? "USD"}
            />
            <AccountStatCard
              icon={Package}
              label={t("items")}
              value={String(order.items.length)}
              fallbackBadge={`${t("subtotal")}: ${formatCurrency(order.subtotal, order.currency)}`}
            />
            <AccountStatCard
              icon={DollarSign}
              label={t("tax")}
              value={
                order.taxAmount && parseFloat(order.taxAmount) > 0
                  ? formatCurrency(order.taxAmount, order.currency)
                  : tc("dash")
              }
              fallbackBadge={
                order.discountAmount && parseFloat(order.discountAmount) > 0
                  ? `${t("discount")}: -${formatCurrency(order.discountAmount, order.currency)}`
                  : undefined
              }
              accentVar="--warning"
            />
            <AccountStatCard
              icon={User}
              label={t("contact")}
              value={contactName ?? t("noContact")}
              fallbackBadge={order.contact?.email ?? undefined}
            />
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">{t("timeline")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-5">
              <StatusStepper order={order} locale={locale} t={t} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-6 min-w-0">
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
                      <Package className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("orderItems")}</h2>
                      <p className="text-xs text-muted-foreground">
                        {t("items")}: {order.items.length}
                      </p>
                    </div>
                  </div>
                </div>
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
                            <Package className="size-4 text-primary shrink-0" />
                            <span className="font-medium">{item.productName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {item.productSku ?? tc("dash")}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPrice, order.currency)}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.discountPct && parseFloat(item.discountPct) > 0
                            ? `${item.discountPct}%`
                            : tc("dash")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.lineTotal, order.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {order.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          {t("noItems")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {order.items.length > 0 && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("totalsSubtotal")}</span>
                      <span>{formatCurrency(order.subtotal, order.currency)}</span>
                    </div>
                    {order.discountAmount && parseFloat(order.discountAmount) > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("totalsDiscount")}</span>
                        <span className="text-success">-{formatCurrency(order.discountAmount, order.currency)}</span>
                      </div>
                    )}
                    {order.taxAmount && parseFloat(order.taxAmount) > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{t("totalsTax")}</span>
                        <span>{formatCurrency(order.taxAmount, order.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-semibold text-foreground border-t border-border pt-2 mt-1">
                      <span>{t("totalsTotal")}</span>
                      <span>{formatCurrency(order.totalAmount, order.currency)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground">{t("detailsCard")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {order.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("notes")}</p>
                      <p className="text-foreground leading-relaxed">{order.notes}</p>
                    </div>
                  )}
                  {order.accountId && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs flex items-center gap-1">
                        <Building2 className="size-3" />
                        {t("account")}
                      </span>
                      <Link href={`/accounts/${order.accountId}`} className="text-xs text-primary hover:underline">
                        {t("viewAccount")}
                      </Link>
                    </div>
                  )}
                  {order.dealId && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs flex items-center gap-1">
                        <Handshake className="size-3" />
                        {t("deal")}
                      </span>
                      <Link href={`/deals/${order.dealId}`} className="text-xs text-primary hover:underline">
                        {t("viewDeal")}
                      </Link>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t("currency")}</span>
                    <span className="text-xs font-mono text-foreground">{order.currency ?? "USD"}</span>
                  </div>
                </CardContent>
              </Card>

              {(order.accountId || order.contact) && <CrossSellPanel order={order} t={t} tc={tc} />}
            </div>
          </div>
        </div>

        <AiChatSheet context={{ type: "order", id: order.id, label: order.number }} />
      </div>
    );
  }
