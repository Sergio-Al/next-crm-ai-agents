"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CalendarClock, X } from "lucide-react";

interface Props {
  args: {
    fromDate: string;
    toDate: string;
    reason?: string;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function RescheduleDeliveriesCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("rescheduleDeliveries");
  const tc = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders/bulk-reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate: args.fromDate,
          toDate: args.toDate,
          reason: args.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToolResult({
          toolCallId,
          result: { error: data.error ?? "Failed to reschedule deliveries" },
        });
        setSubmitting(false);
        return;
      }
      addToolResult({
        toolCallId,
        result: { confirmed: true, jobId: data.jobId, count: data.count, newDate: data.newDate },
      });
    } catch {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    addToolResult({ toolCallId, result: { cancelled: true } });
  };

  const fromFormatted = new Date(args.fromDate).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const toFormatted = new Date(args.toDate).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="size-4 text-amber-400" />
        {t("title")}
      </div>

      <div className="space-y-1.5 text-sm">
        <div>
          <span className="text-muted-foreground">{t("fromLabel")}</span>{" "}
          <span className="font-medium">{fromFormatted}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("toLabel")}</span>{" "}
          <span className="font-medium">{toFormatted}</span>
        </div>
        {args.reason && (
          <div>
            <span className="text-muted-foreground">{t("reasonLabel")}</span>{" "}
            <span>{args.reason}</span>
          </div>
        )}
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
          {submitting ? t("rescheduling") : t("confirmButton")}
        </Button>
      </div>
    </div>
  );
}
