"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, ShoppingCart, Filter, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CreateOrderDialog } from "@/components/create-order-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  discountPercent: string | null;
  taxPercent: string | null;
  totalAmount: string;
  currency: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  itemCount: number;
  createdAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground border-border",
  confirmed: "bg-info/10 text-info border-info/20",
  shipped:   "bg-warning/10 text-warning border-warning/20",
  delivered: "bg-success/10 text-success border-success/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

function formatCurrency(val: string | null, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

export default function OrdersPage() {
  const t = useTranslations("orders");
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    fetch(`/api/orders?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setOrders(json.data ?? []);
        setPagination(json.pagination ?? null);
      })
      .finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => {
    const timer = setTimeout(fetchOrders, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchOrders, search]);

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">
            {pagination ? t("totalOrders", { count: pagination.total }) : "\u00A0"}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <Filter className="size-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("statusAll")}</SelectItem>
              <SelectItem value="draft">{t("statusDraft")}</SelectItem>
              <SelectItem value="confirmed">{t("statusConfirmed")}</SelectItem>
              <SelectItem value="shipped">{t("statusShipped")}</SelectItem>
              <SelectItem value="delivered">{t("statusDelivered")}</SelectItem>
              <SelectItem value="cancelled">{t("statusCancelled")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="size-4 mr-2" />
            {t("createOrder")}
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("headerOrder")}</TableHead>
                  <TableHead>{t("headerContact")}</TableHead>
                  <TableHead>{t("headerItems")}</TableHead>
                  <TableHead>{t("headerTotal")}</TableHead>
                  <TableHead>{t("headerStatus")}</TableHead>
                  <TableHead>{t("headerDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="size-4 text-primary shrink-0" />
                        <span className="font-medium">{order.orderNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[order.contactFirstName, order.contactLastName]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {order.itemCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(order.totalAmount, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[order.status] ?? ""}
                      >
                        {t(`status${order.status.charAt(0).toUpperCase() + order.status.slice(1)}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noOrders")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              {t("showing", {
                from: (page - 1) * pagination.limit + 1,
                to: Math.min(page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        )}
      </div>
      <CreateOrderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={fetchOrders}
      />
    </div>
  );
}
