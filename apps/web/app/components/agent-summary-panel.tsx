"use client";

import { useTranslations } from "next-intl";
import { Sparkles, TrendingUp, AlertTriangle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentSummaryPanelProps {
  contactsCount: number;
  orderDeltaPct: number;
  topPeerProductName?: string;
  onViewFullPlan?: () => void;
}

export function AgentSummaryPanel({
  contactsCount,
  orderDeltaPct,
  topPeerProductName,
  onViewFullPlan,
}: AgentSummaryPanelProps) {
  const t = useTranslations("accountDetail");

  const trendKey =
    orderDeltaPct > 5
      ? "agentTrendUp"
      : orderDeltaPct < -5
        ? "agentTrendDown"
        : "agentTrendFlat";

  const riskKey =
    contactsCount === 0 ? "agentRiskNoContacts" : "agentRiskHealthy";

  const nextActionKey = topPeerProductName
    ? "agentNextActionPeers"
    : "agentNextActionEngage";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 sticky top-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t("agentSummaryTitle")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {t("agentSummaryGenerated", {
                time: t("justNow"),
                model: "GPT-Agent v0.1",
              })}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          {t("agentSummaryLive")}
        </span>
      </div>

      <SummaryRow
        icon={TrendingUp}
        iconClass="bg-success/10 text-success"
        label={t("agentTrendLabel")}
        text={t(trendKey, { delta: Math.abs(orderDeltaPct) })}
      />
      <SummaryRow
        icon={AlertTriangle}
        iconClass="bg-warning/10 text-warning"
        label={t("agentRiskLabel")}
        text={t(riskKey, { count: contactsCount })}
      />
      <SummaryRow
        icon={Target}
        iconClass="bg-primary/10 text-primary"
        label={t("agentNextActionLabel")}
        text={t(nextActionKey, { top: topPeerProductName ?? "" })}
      />

      <Button
        onClick={onViewFullPlan}
        className="w-full mt-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-primary-foreground"
      >
        {t("agentViewFullPlan")}
      </Button>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  iconClass,
  label,
  text,
}: {
  icon: typeof TrendingUp;
  iconClass: string;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 flex gap-3">
      <div
        className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">
          {label}
        </div>
        <p className="text-xs text-foreground mt-0.5 leading-snug">{text}</p>
      </div>
    </div>
  );
}
