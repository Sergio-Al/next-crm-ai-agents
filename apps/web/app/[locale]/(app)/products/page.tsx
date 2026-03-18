"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, Package } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: string;
  currency: string | null;
  unit: string | null;
  stockQty: number | null;
  active: boolean | null;
  tags: string[] | null;
  createdAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
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

export default function ProductsPage() {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json.data);
    setPagination(json.pagination);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
            <p className="text-neutral-400 mt-1">
              {pagination ? t("count", { count: pagination.total }) : tc("loading")}
            </p>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="rounded-2xl border border-white/5 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("headerName")}</TableHead>
                <TableHead>{t("headerSku")}</TableHead>
                <TableHead>{t("headerCategory")}</TableHead>
                <TableHead>{t("headerPrice")}</TableHead>
                <TableHead>{t("headerStock")}</TableHead>
                <TableHead>{t("headerStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-neutral-400 py-8">
                    <Package className="mx-auto size-8 mb-2 text-neutral-600" />
                    {t("noProducts")}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer hover:bg-white/5"
                    onClick={() => router.push(`/products/${product.id}` as any)}
                  >
                    <TableCell className="font-medium text-white">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-neutral-400 font-mono text-sm">
                      {product.sku ?? "—"}
                    </TableCell>
                    <TableCell>
                      {product.category ? (
                        <Badge variant="outline" className="text-xs">{product.category}</Badge>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-white">
                      {formatCurrency(product.price, product.currency)}
                    </TableCell>
                    <TableCell className="text-neutral-400">
                      {product.stockQty !== null ? product.stockQty : "∞"}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              {tc("page", { page: pagination.page, pages: pagination.pages })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {tc("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {tc("next")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
