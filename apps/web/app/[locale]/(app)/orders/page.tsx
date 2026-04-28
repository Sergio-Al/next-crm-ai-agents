"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, ShoppingCart, Filter, Plus, Download } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CreateOrderDialog } from "@/components/create-order-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef, GridReadyEvent, ICellRendererParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Order {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  currency: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  itemCount: number;
  createdAt: string | null;
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

function StatusCellRenderer(params: ICellRendererParams) {
  const status: string = params.value ?? "";
  const cls = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge variant="outline" className={`${cls} text-xs`}>
      {label}
    </Badge>
  );
}

function OrderCellRenderer(params: ICellRendererParams) {
  return (
    <div className="flex items-center gap-2 h-full">
      <ShoppingCart className="size-4 text-orange-400 shrink-0" />
      <span className="font-medium text-foreground">{params.value}</span>
    </div>
  );
}

export default function OrdersPage() {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const gridRef = useRef<AgGridReact<Order>>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickFilter, setQuickFilter] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (status !== "all") params.set("status", status);
    fetch(`/api/orders?${params}`)
      .then((r) => r.json())
      .then((json) => {
        const data: Order[] = (json.data ?? []).map((o: Record<string, unknown>) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          totalAmount: o.totalAmount,
          currency: o.currency,
          contactFirstName: o.contactFirstName,
          contactLastName: o.contactLastName,
          itemCount: o.itemCount ?? 0,
          createdAt: o.createdAt,
        }));
        setOrders(data);
        setTotal(json.pagination?.total ?? data.length);
      })
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const columnDefs = useMemo<ColDef<Order>[]>(() => [
    {
      headerName: t("headerOrder"),
      field: "number",
      cellRenderer: OrderCellRenderer,
      minWidth: 160,
      flex: 1.5,
    },
    {
      headerName: t("headerContact"),
      valueGetter: (p) =>
        [p.data?.contactFirstName, p.data?.contactLastName].filter(Boolean).join(" ") || "—",
      minWidth: 150,
      flex: 1.5,
    },
    {
      headerName: t("headerStatus"),
      field: "status",
      cellRenderer: StatusCellRenderer,
      maxWidth: 140,
      sortable: true,
    },
    {
      headerName: t("headerItems"),
      field: "itemCount",
      maxWidth: 90,
      type: "rightAligned",
      sortable: true,
    },
    {
      headerName: t("headerTotal"),
      valueGetter: (p) => formatCurrency(p.data?.totalAmount ?? null, p.data?.currency ?? null),
      maxWidth: 140,
      type: "rightAligned",
      comparator: (a: string, b: string) => {
        const toNum = (v: string) => parseFloat(v.replace(/[^0-9.-]/g, "")) || 0;
        return toNum(a) - toNum(b);
      },
      sortable: true,
    },
    {
      headerName: t("headerDate"),
      field: "createdAt",
      valueFormatter: (p) =>
        p.value
          ? new Date(p.value).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : tc("dash"),
      maxWidth: 130,
      sortable: true,
    },
  ], [locale, t, tc]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    suppressMovable: false,
    cellStyle: { display: "flex", alignItems: "center" },
  }), []);

  function handleGridReady(e: GridReadyEvent) {
    e.api.sizeColumnsToFit();
  }

  function handleExport() {
    gridRef.current?.api.exportDataAsCsv({ fileName: "orders.csv" });
  }

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-4 h-full flex flex-col">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-muted-foreground mt-1">
              {total !== null ? t("totalOrders", { count: total }) : tc("loading")}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="size-4 mr-2" />
            {t("createOrder")}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v ?? "all")}
          >
            <SelectTrigger className="w-44">
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
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-card flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/70 shrink-0">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
                <ShoppingCart className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
                <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4 mr-2" />
              {t("exportCsv")}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              {t("noOrders")}
            </div>
          ) : (
            <div className="ag-theme-quartz ag-theme-custom flex-1 min-h-0">
              <AgGridReact<Order>
                ref={gridRef}
                theme="legacy"
                rowData={orders}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                quickFilterText={quickFilter}
                pagination
                paginationPageSize={25}
                paginationPageSizeSelector={[25, 50, 100]}
                animateRows
                suppressCellFocus
                onGridReady={handleGridReady}
                onRowClicked={(e) => {
                  if (e.data?.id) router.push(`/orders/${e.data.id}`);
                }}
                rowStyle={{ cursor: "pointer" }}
              />
            </div>
          )}
        </div>
      </div>

      <CreateOrderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={fetchOrders}
      />
    </div>
  );
}
