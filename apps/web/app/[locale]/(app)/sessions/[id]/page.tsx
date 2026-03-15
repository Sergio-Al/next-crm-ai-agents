"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Zap,
  Clock,
  Brain,
  Bell,
  Settings,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  MessageSquare,
  ArrowLeft,
  Circle,
  RotateCw,
  Hash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

interface SessionEvent {
  id: string;
  stepIndex: number | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

interface StepDef {
  type: string;
  description: string;
  config?: Record<string, unknown>;
}

interface AgentSession {
  id: string;
  goal: string;
  status: string;
  plan: StepDef[];
  context: Record<string, unknown>;
  currentStepIndex: number;
  nextRunAt: string | null;
  conversationId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  events: SessionEvent[];
}

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; dot: string }> = {
  running:       { labelKey: "statusRunning",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
  paused:        { labelKey: "statusPaused",    color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20",   dot: "bg-yellow-400" },
  waiting_human: { labelKey: "statusWaiting",   color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",       dot: "bg-blue-400" },
  completed:     { labelKey: "statusCompleted", color: "text-neutral-400", bg: "bg-neutral-500/10 border-neutral-500/20", dot: "bg-neutral-400" },
  failed:        { labelKey: "statusFailed",    color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",         dot: "bg-red-400" },
  cancelled:     { labelKey: "statusCancelled", color: "text-neutral-500", bg: "bg-neutral-500/10 border-neutral-500/20", dot: "bg-neutral-500" },
};

const STEP_ICONS: Record<string, typeof Zap> = {
  crm_action: Settings,
  notify: Bell,
  wait: Clock,
  ai_reason: Brain,
  human_checkpoint: UserCheck,
};

const STEP_LABEL_KEYS: Record<string, string> = {
  crm_action: "stepCrmAction",
  notify: "stepNotification",
  wait: "stepWait",
  ai_reason: "stepAiReasoning",
  human_checkpoint: "stepHumanCheckpoint",
};

const EVENT_ICONS: Record<string, typeof Zap> = {
  step_started: Zap,
  step_completed: CheckCircle2,
  step_failed: XCircle,
  ai_reasoning: Brain,
  crm_action_result: Settings,
  wait_scheduled: Clock,
  human_checkpoint_requested: UserCheck,
  human_checkpoint_resolved: CheckCircle2,
  session_completed: CheckCircle2,
};

function formatRelativeTime(dateStr: string, t: (key: string, values?: Record<string, string | number | Date>) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { count: days });
}

function renderEventDetail(event: SessionEvent, t: (key: string, values?: Record<string, string | number | Date>) => string) {
  const data = event.data as Record<string, string | undefined>;
  switch (event.type) {
    case "step_started":
      return data.description ? (
        <p className="text-sm text-neutral-400">{data.description}</p>
      ) : null;
    case "step_completed":
      return data.result ? (
        <p className="text-sm text-neutral-400">{data.result}</p>
      ) : null;
    case "crm_action_result":
      return (
        <p className="text-sm text-neutral-400">
          {data.description ?? t("actionCompleted")}
        </p>
      );
    case "wait_scheduled":
      return (
        <p className="text-sm text-neutral-400">
          {t("waitingDuration", {
            duration: data.duration ?? "...",
            time: data.nextRunAt
              ? new Date(data.nextRunAt).toLocaleString()
              : t("whenReady"),
          })}
        </p>
      );
    default:
      return null;
  }
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("sessionDetail");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const fetchSession = () => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => setSession(data.session ?? null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleAction = async (action: "pause" | "resume" | "cancel") => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    fetchSession();
  };

  const handleResolve = async (approved: boolean) => {
    await fetch(`/api/sessions/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    fetchSession();
  };

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="p-8 space-y-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden p-8">
        <p className="text-neutral-400">{t("notFound")}</p>
      </div>
    );
  }

  const plan = session.plan ?? [];
  const events = session.events ?? [];
  const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.cancelled;
  const isTerminal = ["completed", "cancelled", "failed"].includes(session.status);
  const progress = plan.length > 0
    ? Math.round(((isTerminal && session.status === "completed" ? plan.length : session.currentStepIndex) / plan.length) * 100)
    : 0;

  // Group events by step
  const eventsByStep = new Map<number, SessionEvent[]>();
  const globalEvents: SessionEvent[] = [];
  for (const event of events) {
    if (event.stepIndex !== null) {
      const arr = eventsByStep.get(event.stepIndex) ?? [];
      arr.push(event);
      eventsByStep.set(event.stepIndex, arr);
    } else {
      globalEvents.push(event);
    }
  }

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="p-8 max-w-5xl space-y-6">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/sessions")}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {t("back")}
        </button>

        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Zap className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white leading-tight">
                {session.goal}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                  <span className={`size-1.5 rounded-full ${statusCfg.dot} ${session.status === "running" ? "animate-pulse" : ""}`} />
                  {t(statusCfg.labelKey)}
                </span>
                <span className="text-xs text-neutral-500 flex items-center gap-1">
                  <Hash className="size-3" />
                  {id.slice(0, 8)}
                </span>
                {session.createdAt && (
                  <span className="text-xs text-neutral-500">
                    {t("created", { time: formatRelativeTime(session.createdAt, t) })}
                  </span>
                )}
                {session.updatedAt && session.updatedAt !== session.createdAt && (
                  <span className="text-xs text-neutral-500">
                    · {t("updated", { time: formatRelativeTime(session.updatedAt, t) })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pl-14">
            {session.status === "running" && (
              <Button size="sm" variant="outline" onClick={() => handleAction("pause")}
                className="h-8 text-xs gap-1.5 rounded-lg">
                <Pause className="size-3" /> {t("pause")}
              </Button>
            )}
            {session.status === "paused" && (
              <Button size="sm" variant="outline" onClick={() => handleAction("resume")}
                className="h-8 text-xs gap-1.5 rounded-lg">
                <Play className="size-3" /> {t("resume")}
              </Button>
            )}
            {!isTerminal && (
              <Button size="sm" variant="outline" onClick={() => handleAction("cancel")}
                className="h-8 text-xs gap-1.5 rounded-lg text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-300">
                <XCircle className="size-3" /> {t("cancel")}
              </Button>
            )}
            {session.conversationId && (
              <Link href={`/chat?id=${session.conversationId}`}>
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 rounded-lg">
                  <MessageSquare className="size-3" /> {t("viewChat")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Worker status banner */}
        {session.status === "running" && events.length === 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <AlertTriangle className="size-4 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">{t("queued")}</p>
              <p className="text-xs text-yellow-400/70 mt-0.5">
                {t("workerHint")}
              </p>
              <code className="block text-xs text-yellow-400/80 bg-yellow-500/5 rounded-md px-2 py-1 mt-1.5 font-mono">
                pnpm --filter @crm-agent/agent-worker dev
              </code>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {t("progress", { current: Math.min(session.currentStepIndex + 1, plan.length), total: plan.length })}
            </span>
            <span className="text-xs font-medium text-neutral-400">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Context / Parameters (if session has context data) */}
        {session.context && Object.keys(session.context).length > 0 && (
          <div className="rounded-xl border border-white/5 bg-neutral-800/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-medium text-neutral-300">{t("parameters")}</h3>
            </div>
            <div className="divide-y divide-white/5">
              {Object.entries(session.context).map(([key, value]) => (
                <div key={key} className="flex items-start gap-4 px-4 py-2.5">
                  <span className="text-xs text-neutral-500 font-mono min-w-[120px] shrink-0 pt-0.5">
                    {key}
                  </span>
                  <span className="text-sm text-neutral-300 break-all">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan Steps — expandable with events */}
        <div className="rounded-xl border border-white/5 bg-neutral-800/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-medium text-neutral-300">{t("plan")}</h3>
          </div>
          <div className="divide-y divide-white/5">
            {plan.map((step, i) => {
              const Icon = STEP_ICONS[step.type] ?? Zap;
              const isCompleted = i < session.currentStepIndex || (isTerminal && session.status === "completed");
              const isCurrent = i === session.currentStepIndex && !isTerminal;
              const isFailed = i === session.currentStepIndex && session.status === "failed";
              const stepEvents = eventsByStep.get(i) ?? [];
              const hasEvents = stepEvents.length > 0;
              const isExpanded = expandedSteps.has(i);
              const hasConfig = step.config && Object.keys(step.config).length > 0;
              const isExpandable = hasEvents || hasConfig || isCurrent;

              return (
                <div key={i}>
                  <button
                    onClick={() => {
                      setExpandedSteps((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] cursor-pointer ${isCurrent ? "bg-primary/5" : ""}`}
                  >
                    {/* Step status indicator */}
                    <div className="mt-0.5 shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : isFailed ? (
                        <XCircle className="size-4 text-red-400" />
                      ) : isCurrent ? (
                        <div className="relative">
                          <Circle className="size-4 text-primary" />
                          <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />
                        </div>
                      ) : (
                        <Circle className="size-4 text-neutral-600" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className={`size-3.5 shrink-0 ${
                          isCompleted ? "text-neutral-500" : isCurrent ? "text-primary" : "text-neutral-600"
                        }`} />
                        <span className={`text-sm font-medium ${
                          isCompleted ? "text-neutral-500" : isCurrent ? "text-white" : "text-neutral-400"
                        }`}>
                          {t(STEP_LABEL_KEYS[step.type] ?? step.type)}
                        </span>
                        <span className="text-xs text-neutral-600 font-mono">#{i + 1}</span>
                        {hasEvents && (
                          <span className="text-xs text-neutral-600">
                            · {t("events", { count: stepEvents.length })}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mt-0.5 ${
                        isCompleted ? "text-neutral-600" : "text-neutral-400"
                      }`}>
                        {step.description}
                      </p>
                      {/* Inline config preview */}
                      {hasConfig && !isExpanded && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {Object.entries(step.config!).map(([k, v]) => (
                            <span key={k} className="inline-flex items-center text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-500 font-mono">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <ChevronRight className={`size-4 text-neutral-600 shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="pl-11 pr-4 pb-3 space-y-2">
                      {/* Config details */}
                      {hasConfig && (
                        <div className="rounded-lg border border-white/5 bg-neutral-900/50 p-3 space-y-1">
                          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{t("configuration")}</span>
                          {Object.entries(step.config!).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-3 text-xs">
                              <span className="text-neutral-500 font-mono">{k}</span>
                              <span className="text-neutral-300">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Current step with no events yet */}
                      {isCurrent && !hasEvents && (
                        <div className="flex items-center gap-2 text-xs text-neutral-500 py-1">
                          <div className="size-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                          <span>{t("waitingWorker")}</span>
                        </div>
                      )}
                      {/* Pending step */}
                      {!isCurrent && !isCompleted && !isFailed && !hasEvents && !hasConfig && (
                        <p className="text-xs text-neutral-600 py-1">{t("notStarted")}</p>
                      )}
                      {/* Completed step with no detailed events */}
                      {isCompleted && !hasEvents && !hasConfig && (
                        <p className="text-xs text-neutral-500 py-1">{t("stepCompleted")}</p>
                      )}
                      {/* Step events */}
                      {stepEvents.map((event) => {
                        const EvIcon = EVENT_ICONS[event.type] ?? Zap;
                        const isFailed = event.type === "step_failed";
                        const isReasoning = event.type === "ai_reasoning";
                        const isCheckpoint = event.type === "human_checkpoint_requested";

                        return (
                          <div key={event.id} className="flex items-start gap-2.5 text-xs">
                            <EvIcon className={`size-3.5 mt-0.5 shrink-0 ${
                              isFailed ? "text-red-400" :
                              event.type === "step_completed" ? "text-emerald-400" :
                              "text-neutral-500"
                            }`} />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium capitalize ${isFailed ? "text-red-400" : "text-neutral-300"}`}>
                                  {event.type.replace(/_/g, " ")}
                                </span>
                                <span className="text-neutral-600 ml-auto shrink-0">
                                  {new Date(event.createdAt).toLocaleTimeString()}
                                </span>
                              </div>

                              {renderEventDetail(event, t)}

                              {isFailed && (event.data as { error?: string })?.error && (
                                <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-red-400">
                                  <AlertTriangle className="size-3 inline mr-1" />
                                  {(event.data as { error: string }).error}
                                </div>
                              )}

                              {isReasoning && (event.data as { reasoning?: string })?.reasoning && (
                                <>
                                  <button
                                    onClick={() => {
                                      setExpandedEvents((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(event.id)) next.delete(event.id);
                                        else next.add(event.id);
                                        return next;
                                      });
                                    }}
                                    className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                                  >
                                    <ChevronDown className={`size-3 transition-transform ${expandedEvents.has(event.id) ? "rotate-180" : ""}`} />
                                    {expandedEvents.has(event.id) ? t("hideReasoning") : t("showReasoning")}
                                  </button>
                                  {expandedEvents.has(event.id) && (
                                    <pre className="whitespace-pre-wrap rounded-md border border-white/5 bg-neutral-900/50 p-2.5 text-neutral-400">
                                      {(event.data as { reasoning: string }).reasoning}
                                    </pre>
                                  )}
                                </>
                              )}

                              {isCheckpoint && session.status === "waiting_human" && event.stepIndex === session.currentStepIndex && (
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" onClick={() => handleResolve(true)}
                                    className="h-7 text-xs rounded-lg">
                                    {t("approve")}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleResolve(false)}
                                    className="h-7 text-xs rounded-lg text-red-400 border-red-500/20 hover:bg-red-500/10">
                                    {t("reject")}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity log — global events & full timeline */}
        <div className="rounded-xl border border-white/5 bg-neutral-800/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-300">{t("activity")}</h3>
            <span className="text-xs text-neutral-600">{t("events", { count: events.length })}</span>
          </div>
          {events.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <RotateCw className="size-5 text-neutral-700 mx-auto mb-2" />
              <p className="text-sm text-neutral-600">{t("noActivity")}</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[27px] top-4 bottom-4 w-px bg-neutral-800" />

              {events.map((event, idx) => {
                const Icon = EVENT_ICONS[event.type] ?? Zap;
                const isFailed = event.type === "step_failed";
                const isComplete = event.type === "step_completed" || event.type === "session_completed";

                return (
                  <div key={event.id} className="relative flex items-start gap-3 px-4 py-2.5">
                    <div className={`relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                      isFailed ? "border-red-500/30 bg-red-500/10" :
                      isComplete ? "border-emerald-500/30 bg-emerald-500/10" :
                      "border-neutral-700 bg-neutral-800"
                    }`}>
                      <Icon className={`size-2.5 ${
                        isFailed ? "text-red-400" :
                        isComplete ? "text-emerald-400" :
                        "text-neutral-500"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`text-xs font-medium capitalize ${isFailed ? "text-red-400" : "text-neutral-300"}`}>
                          {event.type.replace(/_/g, " ")}
                        </span>
                        {event.stepIndex !== null && (
                          <span className="text-xs text-neutral-600 ml-1.5">
                            · {t("step", { index: event.stepIndex + 1 })}
                          </span>
                        )}
                        {renderEventDetail(event, t)}
                      </div>
                      <span className="text-xs text-neutral-600 shrink-0 tabular-nums">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
