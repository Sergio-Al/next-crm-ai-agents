"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface AccountStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Trend percentage delta vs previous period. null = no trend, undefined = hidden */
  deltaPct?: number | null;
  /** Sparkline data points */
  trend?: Array<{ value: number }>;
  /** Override sparkline color via CSS var name (e.g. "--success", "--primary"). Default: --primary */
  accentVar?: string;
  /** Optional badge text shown when no delta is meaningful (e.g. "No links") */
  fallbackBadge?: string;
}

function formatDelta(pct: number) {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function AccountStatCard({
  icon: Icon,
  label,
  value,
  deltaPct,
  trend,
  accentVar = "--primary",
  fallbackBadge,
}: AccountStatCardProps) {
  const hasTrend = trend && trend.length > 1;
  const hasDelta = typeof deltaPct === "number";
  const trendDirection: "up" | "down" | "flat" = hasDelta
    ? deltaPct! > 0
      ? "up"
      : deltaPct! < 0
        ? "down"
        : "flat"
    : "flat";

  const TrendIcon =
    trendDirection === "up"
      ? TrendingUp
      : trendDirection === "down"
        ? TrendingDown
        : Minus;

  const deltaColorClass =
    trendDirection === "up"
      ? "bg-success/10 text-success"
      : trendDirection === "down"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";

  // Use --success for upward trend sparkline, --destructive for down, otherwise accentVar.
  const strokeVar =
    trendDirection === "up"
      ? "--success"
      : trendDirection === "down"
        ? "--destructive"
        : accentVar;

  const gradientId = `spark-${label.replace(/\s+/g, "-")}-${strokeVar}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              deltaColorClass,
            )}
          >
            <TrendIcon className="size-3" />
            {formatDelta(deltaPct!)}
          </span>
        ) : fallbackBadge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {fallbackBadge}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight mt-0.5">
          {value}
        </div>
      </div>
      {hasTrend && (
        <div className="h-10 -mx-1 -mb-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trend}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={`var(${strokeVar})`}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={`var(${strokeVar})`}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={`var(${strokeVar})`}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
