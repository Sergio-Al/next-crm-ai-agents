"use client";

import { Badge } from "@/components/ui/badge";
import { Building2, Globe, Hash, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChatEntityLink } from "./chat-entity-link";

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  sapAccountId: string | null;
  tags: string[] | null;
}

export function AccountListCard({ accounts }: { accounts: Account[] }) {
  const t = useTranslations("accountList");

  if (accounts.length === 0) {
    return (
      <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background/50 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {t("found", { count: accounts.length })}
      </div>
      {accounts.map((account) => (
        <div
          key={account.id}
          className="rounded-md border bg-background p-2.5 transition-colors hover:border-primary/30"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <ChatEntityLink
                  type="account"
                  entityId={account.id}
                  className="font-medium text-sm truncate hover:text-primary transition-colors"
                >
                  {account.name}
                </ChatEntityLink>
                <ChatEntityLink
                  type="account"
                  entityId={account.id}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
                >
                  {t("open")}
                  <ArrowUpRight className="size-3" />
                </ChatEntityLink>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {account.industry && <span>{account.industry}</span>}
                {account.sapAccountId && (
                  <span className="inline-flex items-center gap-1">
                    <Hash className="size-3" />
                    {account.sapAccountId}
                  </span>
                )}
                {account.domain && (
                  <span className="inline-flex items-center gap-1">
                    <Globe className="size-3" />
                    {account.domain}
                  </span>
                )}
              </div>
            </div>
          </div>
          {account.tags && account.tags.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap pl-11">
              {account.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {account.website && (
            <div className="mt-2 pl-11 text-xs text-muted-foreground truncate">
              {account.website}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
