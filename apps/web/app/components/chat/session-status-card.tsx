"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { Link } from "@/i18n/navigation";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  paused: "secondary",
  waiting_human: "outline",
  completed: "secondary",
  failed: "destructive",
  cancelled: "secondary",
};

interface Props {
  result: {
    id: string;
    goal: string;
    status: string;
    currentStepIndex: number;
    totalSteps: number;
    nextRunAt?: string | null;
    error?: string;
  };
}

export function SessionStatusCard({ result }: Props) {
  const t = useTranslations("sessionStatus");

  if (result.error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-background/50 p-3 text-sm text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-primary" />
        <span className="text-sm font-medium flex-1 truncate">
          {result.goal}
        </span>
        <Badge variant={STATUS_VARIANT[result.status] ?? "secondary"}>
          {result.status.replace("_", " ")}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t("progress", { current: result.currentStepIndex, total: result.totalSteps })}
        </span>
        {result.nextRunAt && (
          <span>{t("nextRun")} {new Date(result.nextRunAt).toLocaleString()}</span>
        )}
      </div>

      <Link
        href={`/sessions/${result.id}`}
        className="text-xs text-primary underline underline-offset-2"
      >
        {t("viewDetails")}
      </Link>
    </div>
  );
}
