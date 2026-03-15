"use client";

import type { ToolInvocation } from "ai";
import { useTranslations } from "next-intl";
import { ContactListCard } from "./contact-list-card";
import { ContactDetailCard } from "./contact-detail-card";
import { DealListCard } from "./deal-list-card";
import { ContactFormCard } from "./contact-form-card";
import { DealFormCard } from "./deal-form-card";
import { StageUpdateCard } from "./stage-update-card";
import { SessionPlanCard } from "./session-plan-card";
import { SessionStatusCard } from "./session-status-card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  toolInvocation: ToolInvocation;
  addToolResult: (args: { toolCallId: string; result: unknown }) => void;
}

export function ToolInvocationRenderer({ toolInvocation, addToolResult }: Props) {
  const t = useTranslations("toolRenderer");
  const { toolName, toolCallId, state } = toolInvocation;
  const args = (toolInvocation.args ?? {}) as Record<string, any>;

  // Loading state for read tools
  if (state === "call" || state === "partial-call") {
    // Write tools render forms
    if (toolName === "previewCreateContact") {
      return (
        <ContactFormCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={addToolResult}
        />
      );
    }
    if (toolName === "previewCreateDeal") {
      return (
        <DealFormCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={addToolResult}
        />
      );
    }
    if (toolName === "previewUpdateDealStage") {
      return (
        <StageUpdateCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={addToolResult}
        />
      );
    }
    if (toolName === "previewCreateSession") {
      return (
        <SessionPlanCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={addToolResult}
        />
      );
    }

    // Read tools show loading
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>{t("running", { toolName })}</span>
      </div>
    );
  }

  // Result state — render appropriate card
  if (state === "result") {
    const result = toolInvocation.result;

    if (toolName === "searchContacts" && result?.contacts) {
      return <ContactListCard contacts={result.contacts} />;
    }
    if (toolName === "getContact" && result?.contact) {
      return <ContactDetailCard contact={result.contact} deals={result.deals} />;
    }
    if (toolName === "searchDeals" && result?.deals) {
      return <DealListCard deals={result.deals} />;
    }
    if (toolName === "listPipelineStages" && result?.stages) {
      return (
        <div className="flex flex-wrap gap-1.5 rounded-md border bg-background/50 p-3">
          {result.stages.map((s: { id: string; name: string; position: number }) => (
            <Badge key={s.id} variant="secondary">
              {s.name}
            </Badge>
          ))}
        </div>
      );
    }

    if (toolName === "getSessionStatus" && result && !result.error) {
      return <SessionStatusCard result={result} />;
    }

    // Write tool results (after user confirmed)
    if (
      toolName === "previewCreateContact" ||
      toolName === "previewCreateDeal" ||
      toolName === "previewUpdateDealStage" ||
      toolName === "previewCreateSession"
    ) {
      if (result?.cancelled) {
        return (
          <div className="rounded-md border border-destructive/30 bg-background/50 p-3 text-sm text-muted-foreground">
            {t("cancelled")}
          </div>
        );
      }
      return (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-400">
          {t("confirmed")}
        </div>
      );
    }

    // Fallback
    return (
      <pre className="overflow-x-auto rounded-md border bg-background/50 p-3 text-xs text-muted-foreground">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  }

  return null;
}
