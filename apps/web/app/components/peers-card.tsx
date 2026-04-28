"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Users,
  MapPin,
  ShieldCheck,
  ArrowRight,
  Pill,
  FlaskConical,
  Beaker,
  Droplets,
  Stethoscope,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface PeerSuggestion {
  productId: string;
  productName: string;
  sku: string | null;
  brand: string | null;
  familyName: string | null;
  price: string | null;
  currency: string | null;
  peerCount: number;
  avgPeerDistance: number;
  reason: string | null;
}

interface CrossSellResponse {
  strategy: "peer-centroid" | "no-history";
  subjectAccount: { id: string; name: string } | null;
  peerAccounts: Array<{
    accountId: string;
    accountName: string;
    distance: number;
    orderCount: number;
  }>;
  peerFilter?: "strict" | "loose";
  subjectRegion?: string | null;
  subjectOrderCount: number;
  subjectPurchasedProductCount: number;
  suggestions: PeerSuggestion[];
  reasoningText?: string;
}

interface PeersCardProps {
  accountId?: string;
  contactId?: string;
  limit?: number;
  locale?: string;
  onLoad?: (data: CrossSellResponse | null) => void;
}

function formatPrice(val: string | null, cur: string | null): string {
  if (!val) return "—";
  const num = parseFloat(val);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}

// Pick a deterministic icon based on product family name.
function pickFamilyIcon(family: string | null) {
  const f = (family ?? "").toLowerCase();
  if (/(antibi|amox|azitr)/.test(f)) return Pill;
  if (/(crema|t[oó]pico|derm)/.test(f)) return Droplets;
  if (/(susp|jarabe|liquid|oral)/.test(f)) return FlaskConical;
  if (/(digest|gel|gastro)/.test(f)) return Beaker;
  if (/(analg|dolor|antipi)/.test(f)) return Stethoscope;
  return Package;
}

// Convert avgPeerDistance (lower = closer) into a 0-100 confidence score.
function distanceToConfidence(distance: number) {
  const clamped = Math.max(0, Math.min(1.5, distance));
  return Math.round((1 - clamped / 1.5) * 100);
}

export function PeersCard({
  accountId,
  contactId,
  limit = 5,
  locale,
  onLoad,
}: PeersCardProps) {
  const t = useTranslations("crossSell");
  const [data, setData] = useState<CrossSellResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId && !contactId) {
      setLoading(false);
      onLoad?.(null);
      return;
    }
    setLoading(true);
    fetch("/api/orders/cross-sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, contactId, limit, locale }),
    })
      .then((r) => r.json())
      .then((json: CrossSellResponse | { error: string }) => {
        const next = "error" in json ? null : json;
        setData(next);
        onLoad?.(next);
      })
      .catch(() => {
        setData(null);
        onLoad?.(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, contactId, limit, locale]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <Skeleton className="h-6 w-48 mb-3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data || data.strategy === "no-history" || data.suggestions.length === 0) {
    return null;
  }

  const avgConfidence = Math.round(
    data.suggestions.reduce(
      (s, sug) => s + distanceToConfidence(sug.avgPeerDistance),
      0,
    ) / data.suggestions.length,
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              {t("title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {t("createSuggestedOrder")}
          <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Users className="size-3" />
          {t("peerCount", { count: data.peerAccounts.length })}
        </span>
        {data.peerFilter === "strict" && data.subjectRegion && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <MapPin className="size-3" />
            {t("regionFilter", { region: data.subjectRegion })}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
          <ShieldCheck className="size-3" />
          {t("confidenceLabel", { value: avgConfidence })}
        </span>
      </div>

      {/* Ranked list */}
      <div className="flex flex-col">
        {data.suggestions.map((s, idx) => {
          const Icon = pickFamilyIcon(s.familyName);
          const confidence = distanceToConfidence(s.avgPeerDistance);
          return (
            <div
              key={s.productId}
              className="flex items-center gap-3 py-3 border-t border-border first:border-t-0"
            >
              <div className="flex items-center gap-2 shrink-0">
                <span className="size-6 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center">
                  #{idx + 1}
                </span>
                <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="size-4" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {s.productName}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  {s.sku && <span>{s.sku}</span>}
                  {s.familyName && (
                    <>
                      <span className="text-border">·</span>
                      <Badge variant="outline" className="text-[10px] py-0 h-4">
                        {s.familyName}
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="text-sm font-medium text-foreground shrink-0 w-20 text-right">
                {formatPrice(s.price, s.currency)}
              </div>

              <div className="shrink-0">
                <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-1 text-[11px] font-medium">
                  {t("peersBadge", { count: s.peerCount })}
                </span>
              </div>

              <div className="hidden md:flex items-center gap-2 shrink-0 w-32">
                <Progress value={confidence} className="h-1.5 flex-1" />
                <span className="text-[11px] font-semibold text-muted-foreground w-8 text-right">
                  {confidence}%
                </span>
              </div>

              <div className="hidden lg:block w-40 shrink-0 text-[11px] text-muted-foreground line-clamp-2">
                {s.reason ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
