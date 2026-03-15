"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Deal {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  status: string;
  stageId: string;
  expectedClose: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  createdAt: string | null;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  winProbability: number | null;
  dealCount: number;
  totalValue: string;
  pipelineId: string;
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

export default function DealsPage() {
  const t = useTranslations("deals");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/deals").then((r) => r.json()),
      fetch("/api/pipelines").then((r) => r.json()),
    ])
      .then(([dealsRes, pipelinesRes]) => {
        setDeals(dealsRes.data);
        setStages(pipelinesRes.stages);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
      </div>
    );
  }

  const dealsByStage = stages.map((stage) => ({
    ...stage,
    deals: deals.filter((d) => d.stageId === stage.id),
  }));

  return (
    <div className="flex-1 bg-neutral-900/60 rounded-[2rem] border border-white/5 relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("title")}</h1>
        <p className="text-neutral-400 mt-1">
          {t("activeDeals", { count: deals.length })}
        </p>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">{t("board")}</TabsTrigger>
          <TabsTrigger value="list">{t("list")}</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {dealsByStage.map((stage) => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 rounded-2xl border border-white/5 bg-neutral-800/30"
              >
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{stage.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {stage.deals.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCurrency(stage.totalValue, "USD")}
                  </p>
                </div>
                <div className="p-2 space-y-2 min-h-[8rem]">
                  {stage.deals.map((deal) => (
                    <Card key={deal.id} className="shadow-sm">
                      <CardContent className="p-3 space-y-2">
                        <p className="font-medium text-sm leading-tight">
                          {deal.title}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {formatCurrency(deal.value, deal.currency)}
                          </span>
                          <span>
                            {[deal.contactFirstName, deal.contactLastName]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {stage.deals.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-6">
                      {t("noDeals")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("headerDeal")}</TableHead>
                  <TableHead>{t("headerValue")}</TableHead>
                  <TableHead>{t("headerStage")}</TableHead>
                  <TableHead>{t("headerContact")}</TableHead>
                  <TableHead>{t("headerExpectedClose")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => {
                  const stageName =
                    stages.find((s) => s.id === deal.stageId)?.name ?? "—";
                  return (
                    <TableRow key={deal.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Handshake className="size-4 text-primary shrink-0" />
                          <span className="font-medium">{deal.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(deal.value, deal.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{stageName}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[deal.contactFirstName, deal.contactLastName]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal.expectedClose ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {deals.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noDealsYet")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
