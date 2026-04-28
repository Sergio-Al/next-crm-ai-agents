"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Sparkles,
  StickyNote,
  MoreHorizontal,
  ShoppingCart,
  Users,
  TrendingUp,
  Calendar,
  Hash,
  MapPin,
  CalendarDays,
  UserPlus,
  Upload,
  Mail,
  Phone,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { AccountStatCard } from "@/components/account-stat-card";
import { AgentSummaryPanel } from "@/components/agent-summary-panel";

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

function formatCurrency(val: string | null | undefined, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

function statusBadgeClass(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "bg-success/10 text-success border-success/20";
    case "pending":
      return "bg-warning/10 text-warning border-warning/20";
    case "cancelled":
    case "canceled":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("accountDetail");
  const locale = useLocale();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [topPeerName, setTopPeerName] = useState<string | undefined>();

  useEffect(() => {
    fetch(`/api/accounts/${id}`)
      .then((r) => r.json())
      .then((json) => setAccount(json.data ?? null))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, [id]);

  const orderSparkline = useMemo(
    () =>
      account?.stats?.orderTrend?.map((b) => ({ value: b.count })) ?? [],
    [account],
  );
  const revenueSparkline = useMemo(
    () =>
      account?.stats?.orderTrend?.map((b) => ({
        value: parseFloat(b.revenue || "0"),
      })) ?? [],
    [account],
  );

  if (loading) {
    return (
      <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden flex items-center justify-center">
        <p className="text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  const initials =
    account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "?";

  // Identify a tier tag (e.g., "TIER A") from the account tags.
  const tierTag = account.tags?.find((tag) => /tier/i.test(tag));
  const otherTags = account.tags?.filter((tag) => tag !== tierTag) ?? [];

  // Derive region from the most recent order with a regionCode set.
  const region =
    account.orders.find((o) => o.regionCode)?.regionCode ?? null;

  // Last order relative time
  let lastOrderDisplay = "—";
  let lastOrderFallback: string | undefined;
  if (account.stats?.lastOrderAt) {
    const last = new Date(account.stats.lastOrderAt);
    const hoursAgo = Math.round((Date.now() - last.getTime()) / 3_600_000);
    if (hoursAgo < 24) {
      lastOrderDisplay = t("statLastOrderToday");
      lastOrderFallback = t("statRelativeHours", { hours: hoursAgo });
    } else {
      lastOrderDisplay = last.toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  } else {
    lastOrderFallback = "—";
  }

  const stats = account.stats;

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header banner with gradient */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-primary/40 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--accent)/15%,_transparent_60%)] pointer-events-none" />
          <div className="relative flex flex-col gap-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
              <Link
                href="/accounts"
                className="inline-flex items-center gap-1 hover:text-primary-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                {t("back")}
              </Link>
              <span>/</span>
              <span className="text-primary-foreground/90 truncate">
                {account.name}
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="size-16 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 text-primary-foreground flex items-center justify-center text-xl font-semibold relative">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-success border-2 border-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-tight text-primary-foreground truncate">
                    {account.name}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 backdrop-blur-sm border border-success/30 px-2.5 py-0.5 text-[11px] font-medium text-success-foreground">
                    <span className="size-1.5 rounded-full bg-success" />
                    {t("statusActive")}
                  </span>
                  {tierTag && (
                    <span className="inline-flex items-center rounded-full bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground uppercase tracking-wide">
                      {tierTag}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-primary-foreground/80">
                  {account.sapAccountId && (
                    <span className="inline-flex items-center gap-1">
                      <Hash className="size-3" />
                      {t("sapPrefix")} {account.sapAccountId}
                    </span>
                  )}
                  {region && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {region}
                    </span>
                  )}
                  {account.createdAt && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {t("created", {
                        date: new Date(account.createdAt).toLocaleDateString(
                          locale,
                          { day: "numeric", month: "short", year: "numeric" },
                        ),
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    onClick={() => setChatOpen(true)}
                    size="sm"
                    className="rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                  >
                    <Sparkles className="size-3.5" />
                    {t("askAgent")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  >
                    <StickyNote className="size-3.5" />
                    {t("note")}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-full size-8 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AccountStatCard
            icon={ShoppingCart}
            label={t("statOrders")}
            value={String(stats?.orderCount ?? 0)}
            deltaPct={stats?.orderDeltaPct ?? 0}
            trend={orderSparkline}
          />
          <AccountStatCard
            icon={TrendingUp}
            label={t("statRevenue")}
            value={formatCurrency(stats?.totalRevenue, "USD")}
            deltaPct={stats?.revenueDeltaPct ?? 0}
            trend={revenueSparkline}
          />
          <AccountStatCard
            icon={Users}
            label={t("statContacts")}
            value={String(account.contacts.length)}
            deltaPct={null}
            fallbackBadge={
              account.contacts.length === 0
                ? t("statContactsLinked")
                : undefined
            }
          />
          <AccountStatCard
            icon={Calendar}
            label={t("statLastOrder")}
            value={lastOrderDisplay}
            deltaPct={null}
            fallbackBadge={lastOrderFallback}
            trend={orderSparkline}
            accentVar="--accent"
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main column */}
          <div className="space-y-6 min-w-0">
            {/* Tags */}
            {otherTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {otherTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Peers Also Bought */}
            <PeersCard
              accountId={account.id}
              locale={locale}
              onLoad={(d) => {
                setTopPeerName(d?.suggestions?.[0]?.productName);
              }}
            />

            {/* Recent orders */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
                    <ShoppingCart className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {t("recentOrders")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t("recentOrdersSubtitle", {
                        count: stats?.orderCount ?? account.orders.length,
                      })}
                    </p>
                  </div>
                </div>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {t("viewAll")}
                  <ArrowRight className="size-3" />
                </Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{t("orderNumber")}</TableHead>
                    <TableHead>{t("orderTotal")}</TableHead>
                    <TableHead>{t("orderItems")}</TableHead>
                    <TableHead>{t("orderStatus")}</TableHead>
                    <TableHead className="pr-5 text-right">
                      {t("orderDate")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {account.orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell className="pl-5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex items-center gap-2 font-medium hover:text-primary transition-colors"
                        >
                          <ShoppingCart className="size-3.5 text-muted-foreground shrink-0" />
                          #{order.number}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(order.totalAmount, order.currency)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-medium size-6">
                          {order.itemCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusBadgeClass(order.status)}`}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {order.status}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 text-right text-muted-foreground text-xs">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString(
                              locale,
                              { day: "numeric", month: "short", year: "numeric" },
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {account.orders.length === 0 && (
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

          {/* Right sidebar */}
          <div className="space-y-4">
            <AgentSummaryPanel
              contactsCount={account.contacts.length}
              orderDeltaPct={stats?.orderDeltaPct ?? 0}
              topPeerProductName={topPeerName}
              onViewFullPlan={() => setChatOpen(true)}
            />

            {/* Related contacts */}
            {account.contacts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3">
                <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center">
                  <UserPlus className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("relatedContacts")} (0)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    {t("noContactsDescription")}
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <Button
                    size="sm"
                    className="flex-1 bg-foreground text-background hover:bg-foreground/90"
                  >
                    <UserPlus className="size-3.5" />
                    {t("linkContact")}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    <Upload className="size-3.5" />
                    {t("importContacts")}
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3" />
                    {t("noEmails")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" />
                    {t("noPhones")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("relatedContacts")} ({account.contacts.length})
                  </h3>
                </div>
                <div className="flex flex-col gap-1">
                  {account.contacts.slice(0, 6).map((c) => {
                    const fullName =
                      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                      "—";
                    const init =
                      [c.firstName?.[0], c.lastName?.[0]]
                        .filter(Boolean)
                        .join("")
                        .toUpperCase() || "?";
                    return (
                      <Link
                        key={c.id}
                        href={`/contacts/${c.id}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60 transition-colors"
                      >
                        <div className="size-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                          {init}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {fullName}
                          </div>
                          {c.email && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.email}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <AiChatSheet
        context={{ type: "account", id: account.id, label: account.name }}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  );
}
