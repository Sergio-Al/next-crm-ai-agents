"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Handshake, DollarSign, Layers, CalendarDays, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AiChatSheet } from "@/components/ai-chat-sheet";

interface DealDetail {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  status: string;
  stageId: string;
  stageName: string | null;
  expectedClose: string | null;
  createdAt: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

function formatCurrency(val: string | null, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  won: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("dealDetail");
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${id}`)
      .then((r) => r.json())
      .then((json) => setDeal(json.data ?? null))
      .catch(() => setDeal(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden flex items-center justify-center">
        <p className="text-neutral-400">{t("notFound")}</p>
      </div>
    );
  }

  const contactName = deal.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/deals"
            className="mt-1 p-2 rounded-xl hover:bg-neutral-800/60 transition-colors"
          >
            <ArrowLeft className="size-5 text-neutral-400" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Handshake className="size-6 text-orange-400 shrink-0" />
              <h1 className="text-2xl font-bold tracking-tight text-white truncate">
                {deal.title}
              </h1>
              <Badge className={`${STATUS_COLOR[deal.status] ?? ""} border`}>
                {deal.status}
              </Badge>
            </div>
            {deal.createdAt && (
              <p className="text-xs text-neutral-500 mt-1 ml-9">
                {t("created", { date: new Date(deal.createdAt).toLocaleDateString() })}
              </p>
            )}
          </div>
        </div>

        {/* Metadata cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <DollarSign className="size-3.5" />
                {t("value")}
              </div>
              <p className="text-xl font-semibold text-white">
                {formatCurrency(deal.value, deal.currency)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <Layers className="size-3.5" />
                {t("stage")}
              </div>
              <p className="text-xl font-semibold text-white">
                {deal.stageName ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <CalendarDays className="size-3.5" />
                {t("expectedClose")}
              </div>
              <p className="text-xl font-semibold text-white">
                {deal.expectedClose ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/30 border-white/5">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <User className="size-3.5" />
                {t("contact")}
              </div>
              {contactName ? (
                <Link
                  href={`/contacts/${deal.contact!.id}`}
                  className="text-xl font-semibold text-orange-400 hover:text-orange-300 transition-colors truncate block"
                >
                  {contactName}
                </Link>
              ) : (
                <p className="text-xl font-semibold text-neutral-500">
                  {t("noContact")}
                </p>
              )}
              {deal.contact?.email && (
                <p className="text-xs text-neutral-500 truncate">
                  {deal.contact.email}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating AI chat */}
      <AiChatSheet context={{ type: "deal", id: deal.id, label: deal.title }} />
    </div>
  );
}
