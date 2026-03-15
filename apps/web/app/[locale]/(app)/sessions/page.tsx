"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Zap,
  Pause,
  Play,
  XCircle,
  Clock,
  Brain,
  Bell,
  Settings,
  UserCheck,
  ChevronRight,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";

interface AgentSession {
  id: string;
  goal: string;
  status: string;
  plan: Array<{ type: string; description: string }>;
  currentStepIndex: number;
  nextRunAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; dot: string }> = {
  running:       { labelKey: "statusRunning",   color: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-400" },
  paused:        { labelKey: "statusPaused",    color: "text-yellow-400",  bg: "bg-yellow-500/10",  dot: "bg-yellow-400" },
  waiting_human: { labelKey: "statusWaiting",   color: "text-blue-400",    bg: "bg-blue-500/10",    dot: "bg-blue-400" },
  completed:     { labelKey: "statusCompleted", color: "text-neutral-400", bg: "bg-neutral-500/10", dot: "bg-neutral-500" },
  failed:        { labelKey: "statusFailed",    color: "text-red-400",     bg: "bg-red-500/10",     dot: "bg-red-400" },
  cancelled:     { labelKey: "statusCancelled", color: "text-neutral-500", bg: "bg-neutral-500/10", dot: "bg-neutral-600" },
};

const STEP_ICONS: Record<string, typeof Zap> = {
  crm_action: Settings,
  notify: Bell,
  wait: Clock,
  ai_reason: Brain,
  human_checkpoint: UserCheck,
};

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SessionsPage() {
  const t = useTranslations("sessions");
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = () => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleAction = async (e: React.MouseEvent, id: string, action: "pause" | "resume" | "cancel") => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    fetchSessions();
  };

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="p-8 space-y-4">
          <Skeleton className="h-6 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => !["completed", "cancelled", "failed"].includes(s.status));
  const pastSessions = sessions.filter((s) => ["completed", "cancelled", "failed"].includes(s.status));

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="p-8 max-w-5xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">{t("title")}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {sessions.length} {sessions.length !== 1 ? t("title").toLowerCase() : t("title").toLowerCase()} · {activeSessions.length} {t("active").toLowerCase()}
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-3 rounded-xl bg-neutral-800/50 border border-white/5 mb-4">
              <Zap className="size-6 text-neutral-600" />
            </div>
            <p className="text-sm text-neutral-400 mb-1">{t("noSessions")}</p>
            <p className="text-xs text-neutral-600">
              {t("noSessionsHint")}
            </p>
          </div>
        ) : (
          <>
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-1">
                  {t("active")}
                </h2>
                <div className="rounded-xl border border-white/5 bg-neutral-800/30 divide-y divide-white/5 overflow-hidden">
                  {activeSessions.map((s) => (
                    <SessionRow key={s.id} session={s} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}

            {/* Past sessions */}
            {pastSessions.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider px-1">
                  {t("statusCompleted")}
                </h2>
                <div className="rounded-xl border border-white/5 bg-neutral-800/30 divide-y divide-white/5 overflow-hidden">
                  {pastSessions.map((s) => (
                    <SessionRow key={s.id} session={s} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session: s,
  onAction,
}: {
  session: AgentSession;
  onAction: (e: React.MouseEvent, id: string, action: "pause" | "resume" | "cancel") => void;
}) {
  const t = useTranslations("sessions");
  const statusCfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.cancelled;
  const totalSteps = s.plan?.length ?? 0;
  const progress = totalSteps > 0
    ? Math.round(((s.status === "completed" ? totalSteps : s.currentStepIndex) / totalSteps) * 100)
    : 0;
  const isTerminal = ["completed", "cancelled", "failed"].includes(s.status);

  // Get the current step type for the icon
  const currentStep = s.plan?.[s.currentStepIndex];
  const StepIcon = currentStep ? (STEP_ICONS[currentStep.type] ?? Zap) : Zap;

  return (
    <Link
      href={`/sessions/${s.id}`}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
    >
      {/* Status icon */}
      <div className={`p-2 rounded-lg ${statusCfg.bg} shrink-0`}>
        {s.status === "completed" ? (
          <CheckCircle2 className="size-4 text-neutral-400" />
        ) : s.status === "failed" ? (
          <XCircle className="size-4 text-red-400" />
        ) : (
          <StepIcon className={`size-4 ${statusCfg.color}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200 truncate group-hover:text-white transition-colors">
            {s.goal}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className={`inline-flex items-center gap-1 text-xs ${statusCfg.color}`}>
            <span className={`size-1.5 rounded-full ${statusCfg.dot} ${s.status === "running" ? "animate-pulse" : ""}`} />
            {t(statusCfg.labelKey as any)}
          </span>
          <span className="text-xs text-neutral-600">
            {t("step", { current: Math.min(s.currentStepIndex + 1, totalSteps), total: totalSteps })}
          </span>
          {s.updatedAt && (
            <span className="text-xs text-neutral-600">
              {formatRelativeTime(s.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar (small) */}
      <div className="w-20 shrink-0 hidden sm:block">
        <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isTerminal ? "bg-neutral-600" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-neutral-600 mt-0.5 block text-right">{progress}%</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {s.status === "running" && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-neutral-500 hover:text-yellow-400"
            onClick={(e) => onAction(e, s.id, "pause")}
            title="Pause"
          >
            <Pause className="size-3.5" />
          </Button>
        )}
        {s.status === "paused" && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-neutral-500 hover:text-emerald-400"
            onClick={(e) => onAction(e, s.id, "resume")}
            title="Resume"
          >
            <Play className="size-3.5" />
          </Button>
        )}
        {!isTerminal && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-neutral-500 hover:text-red-400"
            onClick={(e) => onAction(e, s.id, "cancel")}
            title="Cancel"
          >
            <XCircle className="size-3.5" />
          </Button>
        )}
        <ChevronRight className="size-4 text-neutral-700 group-hover:text-neutral-500 transition-colors" />
      </div>
    </Link>
  );
}
