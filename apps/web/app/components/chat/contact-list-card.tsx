"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { Mail, Building2, ArrowUpRight } from "lucide-react";
import { ChatEntityLink } from "./chat-entity-link";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone?: string | null;
  companyName: string | null;
  source: string | null;
  tags: string[] | null;
}

export function ContactListCard({ contacts }: { contacts: Contact[] }) {
  const t = useTranslations("contactList");

  if (contacts.length === 0) {
    return (
      <div className="rounded-md border bg-background/50 p-3 text-sm text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background/50 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {t("found", { count: contacts.length })}
      </div>
      {contacts.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 rounded-md border bg-background p-2.5"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <ChatEntityLink
                type="contact"
                entityId={c.id}
                className="font-medium text-sm truncate hover:text-primary transition-colors"
              >
                {c.firstName} {c.lastName}
              </ChatEntityLink>
              <ChatEntityLink
                type="contact"
                entityId={c.id}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
              >
                {t("open")}
                <ArrowUpRight className="size-3" />
              </ChatEntityLink>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {c.email && (
                <span className="flex items-center gap-1 truncate">
                  <Mail className="size-3" /> {c.email}
                </span>
              )}
              {c.companyName && (
                <span className="flex items-center gap-1 truncate">
                  <Building2 className="size-3" /> {c.companyName}
                </span>
              )}
            </div>
          </div>
          {c.tags && c.tags.length > 0 && (
            <div className="flex gap-1">
              {c.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px] px-1.5">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
