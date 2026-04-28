---
name: page-layouts
description: 'Use when creating or modifying list pages (table + search + pagination) or detail pages (header banner, stat cards, two-column layout, related-data sections). Covers outer container, header patterns, stat cards with sparklines, table structure, skeleton loading, empty states, data fetching, and two-column detail layout.'
---

# Page Layouts Skill — List & Detail Page Patterns

This skill documents the canonical structure for every page inside `apps/web/app/[locale]/(app)/`. Follow these patterns precisely so all pages look and feel consistent.

## Stack

- **Framework**: Next.js 15 App Router, `"use client"` pages
- **Data fetching**: client-side `fetch` + `useEffect` / `useCallback`
- **i18n**: `next-intl` (`useTranslations`, `useLocale`)
- **Icons**: Lucide React
- **UI**: shadcn/ui components from `@/components/ui/*`
- **Charts (detail pages)**: Recharts (via `AccountStatCard`)
- **Routing**: `@/i18n/navigation` (`Link`, `useRouter`)

---

## App Layout

`apps/web/app/[locale]/(app)/layout.tsx` wraps every page:

```tsx
<div className="flex h-screen w-screen p-4 gap-4 overflow-hidden">
  <AppSidebar />
  <main className="flex-1 min-w-0 flex gap-4">{children}</main>
</div>
```

Every page fills the remaining space. **Never add outer padding** — the layout already provides `p-4`.

---

## Outer Container (all pages)

Every page (list AND detail) uses this identical wrapper:

```tsx
<div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
  <div className="p-6 space-y-6">
    {/* page content */}
  </div>
</div>
```

Rules:
- `flex-1` fills the main area
- `rounded-[2rem]` is the global card radius
- The `h-px` gradient line is mandatory — it adds a subtle shine at the top edge
- `overflow-y-auto` enables page-level scroll

---

## Data Fetching Pattern

### Detail page

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const { id } = useParams<{ id: string }>();
const t = useTranslations("myDetailNamespace");
const locale = useLocale();
const [data, setData] = useState<MyDetail | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch(`/api/my-resource/${id}`)
    .then((r) => r.json())
    .then((json) => setData(json.data ?? null))
    .catch(() => setData(null))
    .finally(() => setLoading(false));
}, [id]);
```

### List page

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const t = useTranslations("myListNamespace");
const tc = useTranslations("common");
const router = useRouter();

const [items, setItems] = useState<MyItem[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");
const [page, setPage] = useState(1);
const [pagination, setPagination] = useState<PaginationMeta | null>(null);

const fetchItems = useCallback(async () => {
  setLoading(true);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) params.set("search", search);
  const res = await fetch(`/api/my-resource?${params}`);
  const json = await res.json();
  setItems(json.data ?? []);
  setPagination(json.pagination ?? null);
  setLoading(false);
}, [search, page]);

useEffect(() => { fetchItems(); }, [fetchItems]);
useEffect(() => { setPage(1); }, [search]); // reset page on search change
```

---

## Skeleton Loading State

### Detail page skeleton

```tsx
if (loading) {
  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="p-6 space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />         {/* header banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />    {/* stat cards */}
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />         {/* main section */}
      </div>
    </div>
  );
}
```

### List page skeleton (inline table rows)

```tsx
{loading
  ? Array.from({ length: 8 }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: columnCount }).map((_, j) => (
          <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
        ))}
      </TableRow>
    ))
  : items.map((item) => (/* real rows */))}
```

---

## Not Found State

```tsx
if (!data) {
  return (
    <div className="flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden flex items-center justify-center">
      <p className="text-muted-foreground">{t("notFound")}</p>
    </div>
  );
}
```

---

## Detail Page — Header Banner

Two tiers:

### Tier A — Gradient banner (accounts, premium entities)

Use for entities with rich context (stats, region, tier, agent integration).

```tsx
<div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-primary/40 p-6">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--accent)/15%,_transparent_60%)] pointer-events-none" />
  <div className="relative flex flex-col gap-4">

    {/* Breadcrumb */}
    <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
      <Link href="/my-list" className="inline-flex items-center gap-1 hover:text-primary-foreground transition-colors">
        <ArrowLeft className="size-3.5" />
        {t("back")}
      </Link>
      <span>/</span>
      <span className="text-primary-foreground/90 truncate">{data.name}</span>
    </div>

    <div className="flex items-start gap-4">
      {/* Avatar / initials */}
      <div className="size-16 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 text-primary-foreground flex items-center justify-center text-xl font-semibold relative">
        {initials}
        <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-success border-2 border-primary" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Title + status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-primary-foreground truncate">
            {data.name}
          </h1>
          {/* Status badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 backdrop-blur-sm border border-success/30 px-2.5 py-0.5 text-[11px] font-medium text-success-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            {t("statusActive")}
          </span>
          {/* Tier / classification badge */}
          {tier && (
            <span className="inline-flex items-center rounded-full bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/20 px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground uppercase tracking-wide">
              {tier}
            </span>
          )}
        </div>

        {/* Metadata chips row */}
        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-primary-foreground/80">
          {data.externalId && (
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3" />
              {t("idPrefix")} {data.externalId}
            </span>
          )}
          {data.region && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {data.region}
            </span>
          )}
          {data.createdAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {t("created", { date: new Date(data.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" onClick={() => setChatOpen(true)}
            className="rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Sparkles className="size-3.5" />
            {t("askAgent")}
          </Button>
          <Button size="sm" variant="outline"
            className="rounded-full bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
            <StickyNote className="size-3.5" />
            {t("note")}
          </Button>
          <Button size="icon" variant="outline"
            className="rounded-full size-8 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Tier B — Simple header (contacts, orders, deals)

Use for entities without a strong visual identity or region context.

```tsx
<div className="flex items-start gap-4">
  <Link href="/my-list" className="mt-1 p-2 rounded-xl hover:bg-muted/60 transition-colors">
    <ArrowLeft className="size-5 text-muted-foreground" />
  </Link>
  <Avatar className="size-12">
    <AvatarFallback className="bg-primary/10 text-primary text-lg">{initials}</AvatarFallback>
  </Avatar>
  <div className="flex-1 min-w-0">
    <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{data.name}</h1>
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      {data.category && <Badge variant="secondary" className="text-xs">{data.category}</Badge>}
      {data.createdAt && (
        <span className="text-xs text-muted-foreground">
          {t("created", { date: new Date(data.createdAt).toLocaleDateString() })}
        </span>
      )}
    </div>
  </div>
</div>
```

---

## Detail Page — Stat Cards

Use `AccountStatCard` (at `@/components/account-stat-card`) for any 4-up metric grid.

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  <AccountStatCard
    icon={ShoppingCart}
    label={t("statOrders")}
    value={String(stats?.orderCount ?? 0)}
    deltaPct={stats?.orderDeltaPct ?? 0}
    trend={orderSparkline}           // Array<{ value: number }>
  />
  <AccountStatCard
    icon={TrendingUp}
    label={t("statRevenue")}
    value={formatCurrency(stats?.totalRevenue, "USD")}
    deltaPct={stats?.revenueDeltaPct ?? 0}
    trend={revenueSparkline}
  />
  <AccountStatCard
    icon={Users}
    label={t("statContacts")}
    value={String(count)}
    deltaPct={null}                  // null = hide delta badge
    fallbackBadge={count === 0 ? t("noLinks") : undefined}
  />
  <AccountStatCard
    icon={Calendar}
    label={t("statLastOrder")}
    value={lastOrderDisplay}
    deltaPct={null}
    fallbackBadge={relativeDateLabel}
    accentVar="--accent"             // override sparkline color
  />
</div>
```

**Sparkline data** — derive from trend arrays already in the API response:

```tsx
const orderSparkline = useMemo(
  () => stats?.orderTrend?.map((b) => ({ value: b.count })) ?? [],
  [stats],
);
```

---

## Detail Page — Two-Column Layout

Use `lg:grid-cols-[1fr_320px]` when a sticky right sidebar is needed (agent panel, contacts list).

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

  {/* ── Main column ───────────────────────────────────── */}
  <div className="space-y-6 min-w-0">

    {/* Section with table header */}
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-muted/60 flex items-center justify-center">
            <ShoppingCart className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("sectionTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("sectionSubtitle", { count })}</p>
          </div>
        </div>
        <Link href="/list" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {t("viewAll")} <ArrowRight className="size-3" />
        </Link>
      </div>
      <Table>{/* … */}</Table>
    </div>

  </div>

  {/* ── Right sidebar ─────────────────────────────────── */}
  <div className="space-y-4">
    <AgentSummaryPanel
      contactsCount={data.contacts.length}
      orderDeltaPct={stats?.orderDeltaPct ?? 0}
      topPeerProductName={topPeerName}
      onViewFullPlan={() => setChatOpen(true)}
    />

    {/* Related mini-list or empty state */}
    {data.contacts.length === 0
      ? <EmptyStateCard ... />
      : <MiniListCard items={data.contacts} />}
  </div>

</div>
```

---

## Detail Page — Section Tables

All in-page relation tables share this wrapper:

```tsx
<div className="rounded-2xl border border-border overflow-hidden">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="pl-5">{t("colName")}</TableHead>
        <TableHead>{t("colValue")}</TableHead>
        <TableHead className="pr-5 text-right">{t("colDate")}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50">
          <TableCell className="pl-5">
            <Link href={`/resource/${row.id}`}
              className="inline-flex items-center gap-2 font-medium hover:text-primary transition-colors">
              <IconComponent className="size-3.5 text-muted-foreground shrink-0" />
              {row.label}
            </Link>
          </TableCell>
          <TableCell>{row.value}</TableCell>
          <TableCell className="pr-5 text-right text-muted-foreground text-xs">
            {row.date ? new Date(row.date).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </TableCell>
        </TableRow>
      ))}
      {rows.length === 0 && (
        <TableRow>
          <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
            {t("noRows")}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  </Table>
</div>
```

### Status badge inside table cell

```tsx
<span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusBadgeClass(row.status)}`}>
  <span className="size-1.5 rounded-full bg-current" />
  {row.status}
</span>

function statusBadgeClass(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed": return "bg-success/10 text-success border-success/20";
    case "pending":   return "bg-warning/10 text-warning border-warning/20";
    case "cancelled": return "bg-destructive/10 text-destructive border-destructive/20";
    default:          return "bg-muted text-muted-foreground border-border";
  }
}
```

---

## Detail Page — Empty State Card

```tsx
<div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3">
  <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center">
    <UserPlus className="size-5 text-muted-foreground" />
  </div>
  <div>
    <h3 className="text-sm font-semibold text-foreground">{t("emptyTitle")}</h3>
    <p className="text-xs text-muted-foreground mt-1 max-w-xs">{t("emptyDescription")}</p>
  </div>
  <div className="flex items-center gap-2 w-full">
    <Button size="sm" className="flex-1 bg-foreground text-background hover:bg-foreground/90">
      <PrimaryIcon className="size-3.5" />
      {t("primaryCta")}
    </Button>
    <Button size="sm" variant="outline" className="flex-1">
      <SecondaryIcon className="size-3.5" />
      {t("secondaryCta")}
    </Button>
  </div>
  {/* Optional info chips */}
  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
    <span className="inline-flex items-center gap-1"><Mail className="size-3" />{t("noEmails")}</span>
    <span className="inline-flex items-center gap-1"><Phone className="size-3" />{t("noPhones")}</span>
  </div>
</div>
```

---

## List Page — Header

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
    <p className="text-muted-foreground mt-1">
      {pagination ? t("count", { count: pagination.total }) : tc("loading")}
    </p>
  </div>
  {/* Optional create button */}
  <Button onClick={() => setShowCreateDialog(true)}>
    <Plus className="size-4 mr-2" />
    {t("createItem")}
  </Button>
</div>
```

---

## List Page — Search & Filters

```tsx
<div className="flex items-center gap-3">
  <div className="relative flex-1 max-w-sm">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
    <Input
      placeholder={t("searchPlaceholder")}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="pl-9"
    />
  </div>
  {/* Optional status filter */}
  <Select value={status} onValueChange={(v) => setStatus(v)}>
    <SelectTrigger className="w-40">
      <Filter className="size-4 mr-2 text-muted-foreground" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">{t("statusAll")}</SelectItem>
      {/* … */}
    </SelectContent>
  </Select>
</div>
```

---

## List Page — Table

```tsx
<div className="rounded-2xl border border-border overflow-hidden">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{t("headerName")}</TableHead>
        <TableHead>{t("headerValue")}</TableHead>
        <TableHead className="text-right">{t("headerDate")}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {loading
        ? Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 3 }).map((_, j) => (
                <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
              ))}
            </TableRow>
          ))
        : items.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/my-resource/${item.id}`)}
            >
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <EntityIcon className="size-4 text-primary shrink-0" />
                  {item.name || t("unknown")}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.value}</TableCell>
              <TableCell className="text-right text-muted-foreground text-sm">
                {item.date ? new Date(item.date).toLocaleDateString() : "—"}
              </TableCell>
            </TableRow>
          ))}
      {!loading && items.length === 0 && (
        <TableRow>
          <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
            {t("noItems")}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  </Table>
</div>
```

---

## List Page — Pagination

```tsx
{pagination && pagination.pages > 1 && (
  <div className="flex items-center justify-between">
    <p className="text-sm text-muted-foreground">
      {tc("page", { page: pagination.page, pages: pagination.pages })}
    </p>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
        {tc("previous")}
      </Button>
      <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
        {tc("next")}
      </Button>
    </div>
  </div>
)}
```

---

## Utility Helpers

Always define these inside the file that needs them (no shared utility module):

### Currency formatting

```tsx
function formatCurrency(val: string | null | undefined, cur: string | null) {
  if (!val) return "—";
  const num = parseFloat(val);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur ?? "USD",
    minimumFractionDigits: 0,
  }).format(num);
}
```

### Initials from name

```tsx
const initials = name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((s) => s[0])
  .join("")
  .toUpperCase() || "?";
```

### Localized date

```tsx
new Date(isoString).toLocaleDateString(locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
})
```

---

## AiChatSheet Integration

Every detail page should include the agent chat sheet. It supports both controlled and uncontrolled modes.

```tsx
// State
const [chatOpen, setChatOpen] = useState(false);

// In JSX (at the bottom, inside outer container)
<AiChatSheet
  context={{ type: "account", id: data.id, label: data.name }}
  open={chatOpen}
  onOpenChange={setChatOpen}
/>

// Trigger from header button
<Button onClick={() => setChatOpen(true)} size="sm" className="rounded-full ...">
  <Sparkles className="size-3.5" />
  {t("askAgent")}
</Button>
```

Valid `context.type` values: `"account"` | `"contact"` | `"order"` | `"deal"`.

---

## i18n Rules

1. Every page uses its own namespace (e.g., `"accountDetail"`, `"contacts"`).
2. Always also import `"common"` as `tc` for shared labels (loading, page, previous, next).
3. Always update **both** `en.json` and `es.json` simultaneously.
4. Use `useLocale()` when passing locale to `toLocaleDateString` or API calls.
5. **Never hardcode user-visible strings**.

Namespace key convention:
- `title` — page heading
- `count` — "N items" subtitle with `{ count }` param
- `searchPlaceholder` — input placeholder
- `headerX` — table column headers
- `noItems` — empty table message
- `notFound` — entity not found message
- `created` — "Created {date}"
- `back` — breadcrumb back label
- `statX` — stat card labels

---

## File Placement

```
apps/web/app/[locale]/(app)/
├── my-resource/
│   ├── page.tsx              # list page
│   └── [id]/
│       └── page.tsx          # detail page
apps/web/app/api/
└── my-resource/
    ├── route.ts              # GET list: { data, pagination }
    └── [id]/
        └── route.ts          # GET detail: { data }
apps/web/messages/
├── en.json                   # add namespace keys
└── es.json                   # add same namespace keys (translated)
```

---

## Rules

1. **Never skip the outer container** — always use `flex-1 bg-card rounded-[2rem] border border-border relative overflow-hidden overflow-y-auto`
2. **Always include the gradient line** — `absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-border to-transparent`
3. **Use Tier A header** (gradient banner) for entities with rich metadata (accounts, high-value records); use **Tier B** (simple) for relational records (contacts, orders, deals)
4. **Stat cards are 4-up** — `grid-cols-2 md:grid-cols-4 gap-3` — always use `AccountStatCard`
5. **Two-column layout** — use `lg:grid-cols-[1fr_320px]` with `AgentSummaryPanel` in the right rail for any entity with AI-relevant context
6. **Tables in sections** — wrap with `rounded-2xl border border-border overflow-hidden`; add section header (icon + title + subtitle + "View all" link) above when the table is part of a larger page
7. **Skeleton = same container** — loading state must use the same outer container so there's no layout shift
8. **i18n always** — never hardcode strings; keep namespace in a constant at the top of the file
9. **`"use client"` on all (app) pages** — data fetching is client-side via `useEffect`
10. **No shared utility modules** — define `formatCurrency`, `statusBadgeClass`, `initials` inline in each file that needs them
