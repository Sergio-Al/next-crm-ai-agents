"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Settings, Bell, Clock, Brain, UserCheck } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type StepStatus = "completed" | "current" | "failed" | "waiting" | "pending";

export interface StepNodeData {
  label: string;
  description: string;
  stepType: string;
  status: StepStatus;
  index: number;
  eventCount: number;
  config?: Record<string, unknown>;
  /** Duration label for wait steps (e.g. "3d") */
  duration?: string;
}

export interface TerminatorNodeData {
  label: string;
  status: "default" | "success" | "failed" | "cancelled";
}

/* ------------------------------------------------------------------ */
/*  Icons & colours per step type                                       */
/* ------------------------------------------------------------------ */

const STEP_ICONS: Record<string, typeof Settings> = {
  crm_action: Settings,
  notify: Bell,
  wait: Clock,
  ai_reason: Brain,
  human_checkpoint: UserCheck,
};

const STATUS_STYLES: Record<StepStatus, { border: string; bg: string; ring: string; icon: string; dot: string }> = {
  completed: {
    border: "border-success/40",
    bg: "bg-success/5",
    ring: "",
    icon: "text-success",
    dot: "bg-success",
  },
  current: {
    border: "border-primary/60",
    bg: "bg-primary/5",
    ring: "ring-2 ring-primary/20",
    icon: "text-primary",
    dot: "bg-primary animate-pulse",
  },
  failed: {
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    ring: "ring-2 ring-destructive/20",
    icon: "text-destructive",
    dot: "bg-destructive",
  },
  waiting: {
    border: "border-warning/40",
    bg: "bg-warning/5",
    ring: "ring-2 ring-warning/20",
    icon: "text-warning",
    dot: "bg-warning animate-pulse",
  },
  pending: {
    border: "border-border",
    bg: "bg-muted/30",
    ring: "",
    icon: "text-muted-foreground/50",
    dot: "bg-muted-foreground/30",
  },
};

/* ------------------------------------------------------------------ */
/*  StepNode                                                            */
/* ------------------------------------------------------------------ */

function StepNodeComponent({ data }: NodeProps & { data: StepNodeData }) {
  const Icon = STEP_ICONS[data.stepType] ?? Settings;
  const style = STATUS_STYLES[data.status];

  return (
    <>
      <Handle type="target" position={Position.Top} className="bg-transparent! border-0! w-0! h-0!" />

      <div
        className={`
          group relative w-65 rounded-xl border px-4 py-3
          transition-all duration-200 cursor-pointer
          hover:shadow-md hover:scale-[1.02]
          ${style.border} ${style.bg} ${style.ring}
        `}
      >
        {/* Status dot */}
        <span className={`absolute -left-1.5 top-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-card ${style.dot}`} />

        {/* Header row */}
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg bg-card border border-border/60 shadow-sm`}>
            <Icon className={`size-4 ${style.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate">{data.label}</span>
              <span className="text-[10px] text-muted-foreground/50 font-mono">#{data.index + 1}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
          {data.description}
        </p>

        {/* Duration badge for wait steps */}
        {data.stepType === "wait" && data.duration && (
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-card border border-border/60">
            <Clock className="size-3 text-muted-foreground" />
            {data.duration}
          </div>
        )}

        {/* Event count badge */}
        {data.eventCount > 0 && (
          <div className="absolute -top-1.5 -right-1.5 min-w-5 h-5 flex items-center justify-center px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shadow-sm">
            {data.eventCount}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="bg-transparent! border-0! w-0! h-0!" />
    </>
  );
}

export const StepNode = memo(StepNodeComponent);

/* ------------------------------------------------------------------ */
/*  TerminatorNode (Start / End)                                        */
/* ------------------------------------------------------------------ */

const TERMINATOR_STYLES: Record<string, string> = {
  default: "border-border bg-muted/50 text-muted-foreground",
  success: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
};

function TerminatorNodeComponent({ data }: NodeProps & { data: TerminatorNodeData }) {
  const style = TERMINATOR_STYLES[data.status] ?? TERMINATOR_STYLES.default;

  return (
    <>
      <Handle type="target" position={Position.Top} className="bg-transparent! border-0! w-0! h-0!" />

      <div
        className={`
          flex items-center justify-center
          w-35 h-9 rounded-full border-2 text-xs font-semibold tracking-wide uppercase
          ${style}
        `}
      >
        {data.label}
      </div>

      <Handle type="source" position={Position.Bottom} className="bg-transparent! border-0! w-0! h-0!" />
    </>
  );
}

export const TerminatorNode = memo(TerminatorNodeComponent);
