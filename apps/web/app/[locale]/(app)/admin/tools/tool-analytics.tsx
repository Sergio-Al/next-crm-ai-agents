"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  toolName: string;
  calls: number;
  errors: number;
  p95: number;
};

export function ToolAnalytics() {
  const t = useTranslations("adminTools");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tools/analytics?days=7")
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
            <BarChart3 className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {t("analyticsTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("analyticsSubtitle")}
            </p>
          </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">{t("analyticsTool")}</TableHead>
            <TableHead className="text-right">{t("analyticsCalls")}</TableHead>
            <TableHead className="text-right">{t("analyticsErrors")}</TableHead>
            <TableHead className="text-right pr-5">
              {t("analyticsP95")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 4 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-20 text-center text-muted-foreground text-sm"
              >
                —
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.toolName} className="hover:bg-muted/50">
                <TableCell className="pl-5 font-medium">{r.toolName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.calls}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.errors > 0 ? (
                    <span className="text-destructive">{r.errors}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right pr-5 tabular-nums text-muted-foreground">
                  {r.p95 || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
