"use client";

import { getToolName, type ToolUIPart, type DynamicToolUIPart } from "ai";
import { useTranslations } from "next-intl";
import { ContactListCard } from "./contact-list-card";
import { ContactDetailCard } from "./contact-detail-card";
import { DealListCard } from "./deal-list-card";
import { AccountDetailCard } from "./account-detail-card";
import { AccountListCard } from "./account-list-card";
import { OrderAnomaliesCard } from "./order-anomalies-card";
import { ContactFormCard } from "./contact-form-card";
import { DealFormCard } from "./deal-form-card";
import { StageUpdateCard } from "./stage-update-card";
import { SessionPlanCard } from "./session-plan-card";
import { SessionStatusCard } from "./session-status-card";
import { OrderFormCard } from "./order-form-card";
import { OrderStatusCard } from "./order-status-card";
import { ActivityLogCard } from "./activity-log-card";
import { RescheduleDeliveriesCard } from "./reschedule-deliveries-card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  part: ToolUIPart | DynamicToolUIPart;
  addToolResult: (args: { tool: string; toolCallId: string; output: unknown }) => void;
}

export function ToolInvocationRenderer({ part, addToolResult }: Props) {
  const t = useTranslations("toolRenderer");
  const toolName = getToolName(part);
  const { toolCallId, state } = part;
  const args = ((part as any).input ?? {}) as Record<string, any>;

  // Wrapper that translates the old { toolCallId, result } API to the new v6 API
  // so form card components don't need to change.
  const legacyAddToolResult = ({ toolCallId: id, result }: { toolCallId: string; result: unknown }) => {
    addToolResult({ tool: toolName, toolCallId: id, output: result });
  };

  // Loading state for read tools
  // While tool args are still streaming, show a loading indicator for all tools
  if (state === "input-streaming") {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>{t("running", { toolName })}</span>
      </div>
    );
  }

  if (state === "input-available") {
    // Write tools render forms (args are now complete)
    if (toolName === "previewCreateContact") {
      return (
        <ContactFormCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewCreateDeal") {
      return (
        <DealFormCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewUpdateDealStage") {
      return (
        <StageUpdateCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewCreateSession") {
      return (
        <SessionPlanCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewCreateOrder") {
      return (
        <OrderFormCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewUpdateOrderStatus") {
      return (
        <OrderStatusCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewLogActivity") {
      return (
        <ActivityLogCard
          args={args}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
        />
      );
    }
    if (toolName === "previewRescheduleDeliveries") {
      return (
        <RescheduleDeliveriesCard
          args={args as { fromDate: string; toDate: string; reason?: string }}
          toolCallId={toolCallId}
          addToolResult={legacyAddToolResult}
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
  if (state === "output-available") {
    const result = (part as any).output;

    if (toolName === "searchContacts" && result?.contacts) {
      return <ContactListCard contacts={result.contacts} />;
    }
    if (toolName === "searchAccounts" && result?.accounts) {
      return <AccountListCard accounts={result.accounts} />;
    }
    if (toolName === "getContact" && result?.contact) {
      return <ContactDetailCard contact={result.contact} deals={result.deals} />;
    }
    if (toolName === "getAccount" && result?.account) {
      return (
        <AccountDetailCard
          account={result.account}
          contacts={result.contacts ?? []}
          deals={result.deals ?? []}
          orderStats={result.orderStats ?? null}
          recentOrders={result.recentOrders ?? []}
        />
      );
    }
    if (toolName === "detectOrderAnomalies" && result?.anomalies) {
      return <OrderAnomaliesCard anomalies={result.anomalies} />;
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
      toolName === "previewCreateSession" ||
      toolName === "previewCreateOrder" ||
      toolName === "previewUpdateOrderStatus" ||
      toolName === "previewRescheduleDeliveries"
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

    // Fallback — hide raw results; the AI renders them via OpenUI text.
    return null;
  }

  return null;
}
