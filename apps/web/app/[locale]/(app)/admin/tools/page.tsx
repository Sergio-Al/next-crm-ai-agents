"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, Wrench, Trash2, Pencil, Power } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToolFormSheet, type ToolRow } from "./tool-form-sheet";
import { ToolAnalytics } from "./tool-analytics";

const KIND_BADGE: Record<string, string> = {
  static: "bg-muted text-muted-foreground border-border",
  http: "bg-primary/10 text-primary border-primary/20",
  query: "bg-warning/10 text-warning border-warning/20",
};

export default function AdminToolsPage() {
  const t = useTranslations("adminTools");
  const tc = useTranslations("common");

  const [items, setItems] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ToolRow | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tools");
    const json = await res.json();
    setItems(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = items.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      row.name.toLowerCase().includes(q) ||
      (row.description ?? "").toLowerCase().includes(q)
    );
  });

  async function toggleEnabled(row: ToolRow) {
    await fetch(`/api/tools/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    fetchItems();
  }

  async function deleteRow(row: ToolRow) {
    if (!confirm(t("form.deleteConfirm"))) return;
    await fetch(`/api/tools/${row.id}`, { method: "DELETE" });
    fetchItems();
  }

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              {t("subtitle")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? tc("loading") : t("count", { count: items.length })}
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-2" />
            {t("newTool")}
          </Button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colKind")}</TableHead>
                <TableHead>{t("colHitl")}</TableHead>
                <TableHead>{t("colEnabled")}</TableHead>
                <TableHead className="text-right">{t("colUpdated")}</TableHead>
                <TableHead className="text-right pr-5">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : filtered.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Wrench className="size-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate">{row.name}</div>
                            {row.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-md">
                                {row.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            KIND_BADGE[row.kind] ?? KIND_BADGE.static
                          }`}
                        >
                          {row.kind === "http"
                            ? t("kindHttp")
                            : row.kind === "query"
                              ? t("kindQuery")
                              : t("kindStatic")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.hitl ? t("hitlYes") : t("hitlNo")}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggleEnabled(row)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            row.enabled
                              ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                          }`}
                        >
                          <Power className="size-3" />
                          {row.enabled ? t("hitlYes") : t("hitlNo")}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {row.updatedAt
                          ? new Date(row.updatedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(row)}
                            disabled={row.kind === "static"}
                            title={
                              row.kind === "static"
                                ? "Static tools are defined in code"
                                : ""
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteRow(row)}
                            disabled={row.kind === "static"}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("noTools")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Analytics */}
        <ToolAnalytics />
      </div>

      <ToolFormSheet
        open={creating || editing !== null}
        tool={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          fetchItems();
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
