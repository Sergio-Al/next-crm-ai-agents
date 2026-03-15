"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  winProbability: number | null;
  dealCount: number;
  totalValue: string;
}

interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean | null;
}

function formatCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

export default function PipelinePage() {
  const t = useTranslations("pipeline");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((data) => {
        setPipelines(data.pipelines);
        setStages(data.stages);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
      </div>
    );
  }

  const totalDeals = stages.reduce((s, st) => s + st.dealCount, 0);
  const totalValue = stages.reduce(
    (s, st) => s + parseFloat(st.totalValue),
    0
  );

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
        <p className="text-neutral-400 mt-1">
          {pipelines[0]?.name ?? "Default"} &middot; {t("deals", { count: totalDeals })} &middot;{" "}
          {formatCurrency(totalValue)}
        </p>
      </div>

      {/* Funnel visualization */}
      <div className="flex items-end gap-3 h-40">
        {stages.map((stage, i) => {
          const pct =
            totalDeals > 0
              ? Math.max(8, (stage.dealCount / totalDeals) * 100)
              : 10;
          return (
            <div
              key={stage.id}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs font-bold text-primary">
                {stage.dealCount}
              </span>
              <div
                className="w-full rounded-t-md bg-primary/20 border border-primary/30 transition-all"
                style={{ height: `${pct}%` }}
              >
                <div
                  className="w-full rounded-t-md bg-primary transition-all"
                  style={{
                    height: `${stage.winProbability ?? (100 - i * 15)}%`,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stage.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stage cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stages.map((stage) => (
          <Card key={stage.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GitBranch className="size-4 text-primary" />
                  {stage.name}
                </CardTitle>
                <Badge variant="secondary">{t("deals", { count: stage.dealCount })}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("totalValue")}</span>
                <span className="font-semibold">
                  {formatCurrency(stage.totalValue)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="size-3" />
                    {t("winProbability")}
                  </span>
                  <span>{stage.winProbability ?? 0}%</span>
                </div>
                <Progress value={stage.winProbability ?? 0} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>    </div>  );
}
