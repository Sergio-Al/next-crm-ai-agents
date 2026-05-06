"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardList, X } from "lucide-react";

const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "task"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

interface Props {
  args: {
    type?: ActivityType;
    subject?: string;
    body?: string;
    contactId?: string;
    contactName?: string;
    dealId?: string;
    dealName?: string;
    scheduledAt?: string;
    durationMin?: number;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

function toDatetimeLocal(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityLogCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("activityForm");
  const tc = useTranslations("common");
  const [form, setForm] = useState({
    type: (args.type ?? "note") as ActivityType,
    subject: args.subject ?? "",
    body: args.body ?? "",
    scheduledAt: toDatetimeLocal(args.scheduledAt),
    durationMin:
      typeof args.durationMin === "number" ? String(args.durationMin) : "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          subject: form.subject,
          body: form.body || undefined,
          contactId: args.contactId,
          dealId: args.dealId,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt).toISOString()
            : undefined,
          durationMin: form.durationMin
            ? Number(form.durationMin)
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToolResult({
          toolCallId,
          result: { error: data.error ?? "Failed to log activity" },
        });
        setSubmitting(false);
        return;
      }
      addToolResult({
        toolCallId,
        result: { confirmed: true, activity: data.data },
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
        <ClipboardList className="size-4 text-primary" />
        {t("title")}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">{t("type")} *</label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as ActivityType })
            }
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            {t("scheduledAt")}
          </label>
          <Input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) =>
              setForm({ ...form, scheduledAt: e.target.value })
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">
            {t("subject")} *
          </label>
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">{t("body")}</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {args.contactName ? (
          <div>
            <label className="text-xs text-muted-foreground">
              {t("contact")}
            </label>
            <Input
              value={args.contactName}
              readOnly
              className="h-8 text-sm bg-muted"
            />
          </div>
        ) : null}
        {args.dealName ? (
          <div>
            <label className="text-xs text-muted-foreground">{t("deal")}</label>
            <Input
              value={args.dealName}
              readOnly
              className="h-8 text-sm bg-muted"
            />
          </div>
        ) : null}
        <div>
          <label className="text-xs text-muted-foreground">
            {t("durationMin")}
          </label>
          <Input
            type="number"
            min={0}
            value={form.durationMin}
            onChange={(e) =>
              setForm({ ...form, durationMin: e.target.value })
            }
            className="h-8 text-sm"
          />
        </div>
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
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={!form.subject || submitting}
        >
          <ClipboardList className="size-3 mr-1" />
          {submitting ? t("saving") : t("confirmButton")}
        </Button>
      </div>
    </div>
  );
}
