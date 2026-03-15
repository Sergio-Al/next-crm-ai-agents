"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { DollarSign, Calendar } from "lucide-react";

interface Deal {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  status: string;
  expectedClose: string | null;
  stageName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
}

export function DealListCard({ deals }: { deals: Deal[] }) {
  const t = useTranslations("dealList");

  if (deals.length === 0) {
    return (
      <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background/50 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {t("found", { count: deals.length })}
      </div>
      {deals.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">{d.title}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              {(d.contactFirstName || d.contactLastName) && (
                <span>
                  {d.contactFirstName} {d.contactLastName}
                </span>
              )}
              {d.expectedClose && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" /> {d.expectedClose}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {d.stageName && (
              <Badge variant="secondary" className="text-[10px]">
                {d.stageName}
              </Badge>
            )}
            {d.value && (
              <span className="text-sm font-medium flex items-center gap-0.5">
                <DollarSign className="size-3" />
                {Number(d.value).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
