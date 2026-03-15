"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, X, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  args: {
    dealId?: string;
    dealTitle?: string;
    currentStage?: string;
    newStageId?: string;
    newStageName?: string;
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function StageUpdateCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("stageUpdate");
  const tc = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!args.dealId || !args.newStageId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${encodeURIComponent(args.dealId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: args.newStageId }),
      });
      const data = await res.json();
      addToolResult({
        toolCallId,
        result: { confirmed: true, deal: data.data },
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
        <GitBranch className="size-4 text-primary" />
        {t("title")}
      </div>

      <div className="text-sm">
        <span className="text-muted-foreground">{t("dealLabel")}</span>{" "}
        <span className="font-medium">{args.dealTitle ?? "Unknown"}</span>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Badge variant="outline">{args.currentStage ?? "?"}</Badge>
        <ArrowRight className="size-4 text-muted-foreground" />
        <Badge className="bg-primary text-primary-foreground">
          {args.newStageName ?? "?"}
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
          {submitting ? t("moving") : t("confirmButton")}
        </Button>
      </div>
    </div>
  );
}
