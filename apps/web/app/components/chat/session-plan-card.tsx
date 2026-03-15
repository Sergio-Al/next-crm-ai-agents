"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap,
  X,
  Trash2,
  Clock,
  Brain,
  Bell,
  Settings,
  UserCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";

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

interface StepDef {
  type: string;
  description: string;
  config?: Record<string, unknown>;
}

interface Props {
  args: {
    goal?: string;
    steps?: StepDef[];
  };
  toolCallId: string;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function SessionPlanCard({ args, toolCallId, addToolResult }: Props) {
  const t = useTranslations("sessionPlan");
  const tc = useTranslations("common");
  const [goal] = useState(args.goal ?? "");
  const [steps, setSteps] = useState<StepDef[]>(args.steps ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateWaitDuration = (index: number, duration: string) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, config: { ...s.config, duration } } : s,
      ),
    );
  };

  const handleConfirm = async () => {
    if (steps.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, plan: steps }),
      });
      const data = await res.json();
      setCreatedId(data.session?.id ?? null);
      addToolResult({
        toolCallId,
        result: { confirmed: true, sessionId: data.session?.id },
      });
    } catch {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    addToolResult({ toolCallId, result: { cancelled: true } });
  };

  if (createdId) {
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 space-y-2">
        <p className="text-sm text-green-400">
          ✓ {t("success")}
        </p>
        <Link
          href={`/sessions/${createdId}`}
          className="text-sm text-primary underline underline-offset-2"
        >
          {t("viewLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Zap className="size-4 text-primary" />
        {t("title")}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">{t("goalLabel")}</p>
        <p className="text-sm font-medium">{goal}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("planLabel", { count: steps.length })}
        </p>
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.type] ?? Zap;
          return (
            <div
              key={i}
              className="flex items-start gap-2 rounded border bg-muted/30 p-2"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">
                  {i + 1}.
                </span>
                <Icon className="size-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium">
                    {STEP_LABEL_KEYS[step.type] ? t(STEP_LABEL_KEYS[step.type] as any) : step.type}
                  </span>
                  <p className="text-xs text-muted-foreground truncate">
                    {step.description}
                  </p>
                  {step.type === "wait" && (
                    <Input
                      value={
                        (step.config?.duration as string) ?? "1d"
                      }
                      onChange={(e) =>
                        updateWaitDuration(i, e.target.value)
                      }
                      className="h-6 text-xs w-20 mt-1"
                      placeholder="e.g. 3d"
                    />
                  )}
                </div>
              </div>
              <button
                onClick={() => removeStep(i)}
                className="text-muted-foreground hover:text-destructive p-0.5"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={submitting || steps.length === 0}
        >
          {submitting ? t("creating") : t("confirmButton")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={submitting}
        >
          <X className="size-3.5 mr-1" />
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
