"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Package, Tag, DollarSign, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductDetail {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  price: string;
  currency: string | null;
  unit: string | null;
  stockQty: number | null;
  active: boolean;
  tags: string[] | null;
  createdAt: string | null;
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

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("productDetail");
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((json) => setProduct(json.data ?? null))
      .catch(() => setProduct(null))
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

  if (!product) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden flex items-center justify-center">
        <p className="text-neutral-400">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/products"
            className="mt-1 p-2 rounded-xl hover:bg-neutral-800/60 transition-colors"
          >
            <ArrowLeft className="size-5 text-neutral-400" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Package className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white truncate">{product.name}</h1>
                <p className="text-sm text-neutral-400 mt-0.5">
                  {product.sku ? `SKU: ${product.sku}` : t("noSku")}
                </p>
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              product.active
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }
          >
            {product.active ? t("active") : t("inactive")}
          </Badge>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-800/40 border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-neutral-400 mb-1">
                <DollarSign className="size-4" />
                {t("price")}
              </div>
              <p className="text-xl font-bold text-white">
                {formatCurrency(product.price, product.currency)}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {t("perUnit", { unit: product.unit ?? "piece" })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-neutral-400 mb-1">
                <Layers className="size-4" />
                {t("category")}
              </div>
              <p className="text-xl font-bold text-white">
                {product.category ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-neutral-400 mb-1">
                <Package className="size-4" />
                {t("stock")}
              </div>
              <p className="text-xl font-bold text-white">
                {product.stockQty !== null ? product.stockQty : "∞"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-neutral-400 mb-1">
                <Tag className="size-4" />
                {t("tags")}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {product.tags && product.tags.length > 0 ? (
                  product.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-neutral-500 text-sm">—</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Description */}
        {product.description && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">{t("description")}</h2>
            <p className="text-neutral-300 leading-relaxed">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
