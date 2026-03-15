"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  Handshake,
  DollarSign,
  UserPlus,
  Activity,
} from "lucide-react";
import { BentoGrid, BentoCard } from "@/components/bento-grid";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardStats {
  totalContacts: number;
  activeDeals: number;
  pipelineValue: string;
  openLeads: number;
  recentContacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    companyName: string | null;
  }>;
  stages: Array<{
    name: string;
    dealCount: number;
    totalValue: string;
  }>;
}

function StatValue({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function formatCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const t = useTranslations("dashboard");

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
          <p className="text-neutral-400 mt-1">{t("subtitle")}</p>
        </div>
        <BentoGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <BentoCard key={i}>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32 mt-2" />
            </BentoCard>
          ))}
        </BentoGrid>
      </div>
      </div>
    );
  }

  const maxStageValue = Math.max(
    ...stats.stages.map((s) => parseFloat(s.totalValue)),
    1
  );

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
        <p className="text-neutral-400 mt-1">{t("subtitle")}</p>
      </div>

      <BentoGrid>
        {/* Row 1: Stats */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <StatValue value={stats.totalContacts} label={t("totalContacts")} />
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Users className="size-5" />
            </div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <StatValue value={stats.activeDeals} label={t("activeDeals")} />
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Handshake className="size-5" />
            </div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <StatValue
              value={formatCurrency(stats.pipelineValue)}
              label={t("pipelineValue")}
            />
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <DollarSign className="size-5" />
            </div>
          </div>
        </BentoCard>

        {/* Row 2: Pipeline stages (2 cols) + Open Leads (1 col) */}
        <BentoCard colSpan={2} rowSpan={2}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="size-4 text-primary" />
            <h2 className="font-semibold">{t("pipelineStages")}</h2>
          </div>
          <div className="space-y-4">
            {stats.stages.map((stage) => {
              const pct =
                (parseFloat(stage.totalValue) / maxStageValue) * 100;
              return (
                <div key={stage.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium">{stage.name}</span>
                    <span className="text-muted-foreground">
                      {t("deals", { count: stage.dealCount })} &middot;{" "}
                      {formatCurrency(stage.totalValue)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <StatValue value={stats.openLeads} label={t("openLeads")} />
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <UserPlus className="size-5" />
            </div>
          </div>
        </BentoCard>

        {/* Row 3: Recent Contacts */}
        <BentoCard>
          <h2 className="font-semibold mb-3">{t("recentContacts")}</h2>
          <div className="space-y-3">
            {stats.recentContacts.map((c) => {
              const initials = [c.firstName?.[0], c.lastName?.[0]]
                .filter(Boolean)
                .join("")
                .toUpperCase() || "?";
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || t("unknown")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.companyName || c.email || "—"}
                    </p>
                  </div>
                </div>
              );
            })}
            {stats.recentContacts.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
            )}
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
    </div>
  );
}
