"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { Mail, Phone, Building2, Tag, DollarSign } from "lucide-react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  tags: string[] | null;
}

interface Deal {
  id: string;
  title: string;
  value: string | null;
  status: string;
  stageName: string | null;
}

export function ContactDetailCard({
  contact,
  deals,
}: {
  contact: Contact;
  deals: Deal[];
}) {
  const t = useTranslations("contactDetail");

  return (
    <div className="rounded-md border bg-background/50 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarFallback className="bg-primary/10 text-primary">
            {(contact.firstName?.[0] ?? "") + (contact.lastName?.[0] ?? "")}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">
            {contact.firstName} {contact.lastName}
          </div>
          {contact.source && (
            <Badge variant="secondary" className="text-[10px] mt-0.5">
              {contact.source}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {contact.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="size-3" /> {contact.email}
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="size-3" /> {contact.phone}
          </div>
        )}
        {contact.companyName && (
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3" /> {contact.companyName}
          </div>
        )}
      </div>

      {contact.tags && contact.tags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Tag className="size-3 text-muted-foreground" />
          <div className="flex gap-1 flex-wrap">
            {contact.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] px-1.5">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {deals.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            {t("deals", { count: deals.length })}
          </div>
          {deals.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between text-xs py-1"
            >
              <span className="truncate">{d.title}</span>
              <div className="flex items-center gap-2">
                {d.stageName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {d.stageName}
                  </Badge>
                )}
                {d.value && (
                  <span className="text-muted-foreground flex items-center gap-0.5">
                    <DollarSign className="size-3" />
                    {Number(d.value).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
