"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, X, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20",
  confirmed: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  shipped: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

interface Props {
  args: {
    orderId?: string;
    orderNumber?: string;
    currentStatus?: string;
    newStatus?: string;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function OrderStatusCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("orderStatusUpdate");
  const tc = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!args.orderId || !args.newStatus) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(args.orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: args.newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToolResult({
          toolCallId,
          result: { error: data.error ?? "Failed to update order status" },
        });
        setSubmitting(false);
        return;
      }
      addToolResult({
        toolCallId,
        result: { confirmed: true, order: data.data },
      });
    } catch {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    addToolResult({ toolCallId, result: { cancelled: true } });
  };

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShoppingCart className="size-4 text-orange-400" />
        {t("title")}
      </div>

      <div className="text-sm">
        <span className="text-muted-foreground">{t("orderLabel")}</span>{" "}
        <span className="font-medium">{args.orderNumber ?? "Unknown"}</span>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Badge variant="outline" className={STATUS_COLORS[args.currentStatus ?? ""] ?? ""}>
          {t(`status_${args.currentStatus ?? "draft"}`)}
        </Badge>
        <ArrowRight className="size-4 text-muted-foreground" />
        <Badge className={`${STATUS_COLORS[args.newStatus ?? ""] ?? ""} border`}>
          {t(`status_${args.newStatus ?? "confirmed"}`)}
        </Badge>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={submitting}
        >
          <X className="size-3 mr-1" /> {tc("cancel")}
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={submitting}>
          {submitting ? t("updating") : t("confirmButton")}
        </Button>
      </div>
    </div>
  );
}
