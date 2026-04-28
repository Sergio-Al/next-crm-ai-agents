"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search, Building2, Hash, Globe, Tags, Sparkles, ArrowRight } from "lucide-react";
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

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  sapAccountId: string | null;
  tags: string[] | null;
  createdAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function formatWebsite(website: string | null): string {
  if (!website) return "";
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export default function AccountsPage() {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/accounts?${params}`);
    const json = await res.json();
    setAccounts(json.data ?? []);
    setPagination(json.pagination ?? null);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const taggedCount = accounts.filter((account) => (account.tags ?? []).length > 0).length;
  const withSapCount = accounts.filter((account) => Boolean(account.sapAccountId)).length;

  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-6">
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
              <p className="text-muted-foreground mt-1">
                {t("subtitle")}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              <Sparkles className="size-3.5" />
              {pagination ? t("count", { count: pagination.total }) : tc("loading")}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/60 bg-card/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("statVisible")}</p>
              <p className="text-lg font-semibold text-foreground mt-1">{accounts.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("statWithSap")}</p>
              <p className="text-lg font-semibold text-foreground mt-1">{withSapCount}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("statTagged")}</p>
              <p className="text-lg font-semibold text-foreground mt-1">{taggedCount}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[14rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="outline" className="rounded-full">{t("statVisible")}: {accounts.length}</Badge>
          {pagination && <Badge variant="outline" className="rounded-full">{t("count", { count: pagination.total })}</Badge>}
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-card/70">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-muted/30">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">{t("tableTitle")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("tableSubtitle")}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("headerName")}</TableHead>
                <TableHead>{t("headerIndustry")}</TableHead>
                <TableHead>{t("headerSap")}</TableHead>
                <TableHead>{t("headerWebsite")}</TableHead>
                <TableHead>{t("headerTags")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : accounts.map((account) => (
                    <TableRow
                      key={account.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/accounts/${account.id}`)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-3">
                          <span className="size-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center text-xs font-semibold border border-primary/20">
                            {(account.name || t("unknown")).slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{account.name || t("unknown")}</p>
                            <p className="text-xs text-muted-foreground">{account.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.industry ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {account.sapAccountId ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs bg-muted/50">
                            <Hash className="size-3" />
                            {account.sapAccountId}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {account.website ? (
                          <span className="inline-flex items-center gap-1.5 max-w-[13rem]">
                            <Globe className="size-3.5 shrink-0" />
                            <span className="truncate">{formatWebsite(account.website)}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap items-center">
                          {(account.tags ?? []).slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {(account.tags ?? []).length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(account.tags ?? []).length - 2}
                            </Badge>
                          )}
                          {(account.tags ?? []).length === 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Tags className="size-3" />
                              {tc("dash")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-8">
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
              {!loading && accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    <Building2 className="size-8 mx-auto mb-2 opacity-50" />
                    <p>{t("noAccounts")}</p>
                    <p className="text-xs mt-1">{t("noAccountsHint")}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
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
