"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { AlertTriangle, AlertCircle, Clock, Truck, Wifi } from "lucide-react";

export interface OrderAnomaly {
  orderId: string;
  orderNumber: string;
  accountName: string | null;
  type: "overdue_delivery" | "stuck_confirmed" | "sap_error";
  severity: "warning" | "critical";
  detail: string;
  daysSince: number;
}

const TYPE_ICONS = {
  overdue_delivery: Truck,
  stuck_confirmed: Clock,
  sap_error: Wifi,
};

const SEVERITY_STYLES = {
  critical: "border-destructive/40 bg-destructive/5",
  warning: "border-yellow-500/40 bg-yellow-500/5",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

function groupByType(anomalies: OrderAnomaly[]) {
  const groups: Record<string, OrderAnomaly[]> = {};
  for (const a of anomalies) {
    if (!groups[a.type]) groups[a.type] = [];
    groups[a.type].push(a);
  }
  return groups;
}

export function OrderAnomaliesCard({ anomalies }: { anomalies: OrderAnomaly[] }) {
  const t = useTranslations("orderAnomalies");

  if (anomalies.length === 0) {
    return (
      <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        {t("noAnomalies")}
      </div>
    );
  }

  const groups = groupByType(anomalies);

  return (
    <div className="space-y-2 rounded-md border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        <AlertTriangle className="size-3.5 text-yellow-500" />
        {t("found", { count: anomalies.length })}
      </div>

      {(["overdue_delivery", "stuck_confirmed", "sap_error"] as const).map((type) => {
        const rows = groups[type];
        if (!rows?.length) return null;
        const Icon = TYPE_ICONS[type];

        return (
          <div key={type} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Icon className="size-3" />
              {t(`type_${type}`)}
            </div>
            {rows.map((a) => (
              <div
                key={a.orderId}
                className={`flex items-start justify-between gap-2 rounded-md border px-2.5 py-2 ${SEVERITY_STYLES[a.severity]}`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{a.orderNumber}</span>
                    {a.accountName && (
                      <span className="text-[10px] text-muted-foreground truncate">{a.accountName}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{a.detail}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[a.severity]}`}
                  >
                    {a.severity === "critical" ? (
                      <AlertCircle className="size-2.5" />
                    ) : (
                      <AlertTriangle className="size-2.5" />
                    )}
                    {t(`severity_${a.severity}`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {t("daysSince", { count: a.daysSince })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
