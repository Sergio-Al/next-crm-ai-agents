---
name: design-tokens
description: 'Use when adding, modifying, or working with design tokens, colors, theming, or component styling. Covers OKLCH color palette, CSS custom properties, Tailwind CSS v4 theme integration, dark/light mode, shadcn/ui theming, radius scale, and status/badge tokens.'
---

# Design Tokens Skill — Theming & Color System

This skill provides conventions and patterns for working with the project's design token system.

## Stack

- **CSS Framework**: Tailwind CSS v4.2.1 (no separate config file — all inlined)
- **Color Space**: OKLCH for perceptual uniformity
- **UI Library**: shadcn/ui (style: `base-nova`, base color: `neutral`)
- **Theme Switching**: `next-themes` (class-based, default: `dark`, system detection enabled)
- **PostCSS**: `@tailwindcss/postcss` only
- **Icons**: Lucide React

## Architecture

```
apps/web/
├── app/
│   ├── globals.css              # All design tokens defined here
│   ├── components/
│   │   ├── theme-provider.tsx   # next-themes ThemeProvider wrapper
│   │   └── theme-toggle.tsx     # Light/dark toggle button
├── components.json              # shadcn/ui configuration
└── postcss.config.mjs           # @tailwindcss/postcss plugin
```

There is **no `tailwind.config.ts`**. Tailwind v4 configuration is fully inlined in `globals.css` via `@theme inline` blocks.

## Color Palette

All colors use OKLCH. The brand palette:

| Token | Light Mode | Dark Mode | Hex Reference |
|-------|-----------|-----------|---------------|
| `--primary` | `oklch(0.278 0.131 248)` | `oklch(0.655 0.139 218)` | #003C79 / #00A8E8 |
| `--secondary` | `oklch(0.945 0.025 220)` | `oklch(0.22 0.015 248 / 30%)` | #00A8E8 tint |
| `--accent` | `oklch(0.84 0.145 84)` | `oklch(0.84 0.145 84)` | #FFC857 |
| `--destructive` | `oklch(0.598 0.219 27)` | `oklch(0.704 0.191 22.216)` | #EF4444 |

### Status Colors

| Token | Purpose | Hex Reference |
|-------|---------|---------------|
| `--success` | Positive outcomes | #10B981 |
| `--warning` | Caution states | #F59E0B |
| `--info` | Informational | #3B82F6 |
| `--destructive` | Errors/danger | #EF4444 |

Each status token has a `-foreground` companion for text contrast.

### Badge Colors

Specialized counter badge tokens for dashboard cards:

| Token Pair | Purpose |
|-----------|---------|
| `--badge-orders-bg` / `--badge-orders-fg` | Order count badges |
| `--badge-revenue-bg` / `--badge-revenue-fg` | Revenue badges |
| `--badge-delivery-bg` / `--badge-delivery-fg` | Delivery badges |

### Chart Colors

Five chart tokens (`--chart-1` through `--chart-5`) with distinct hues for data visualization.

## Radius Scale

Base radius: `--radius: 0.625rem` (10px). Scaled variants in `@theme inline`:

| Tailwind Class | CSS Variable | Calculation |
|---------------|-------------|-------------|
| `rounded-sm` | `--radius-sm` | `radius × 0.6` |
| `rounded-md` | `--radius-md` | `radius × 0.8` |
| `rounded-lg` | `--radius-lg` | `radius` (base) |
| `rounded-xl` | `--radius-xl` | `radius × 1.4` |
| `rounded-2xl` | `--radius-2xl` | `radius × 1.8` |
| `rounded-3xl` | `--radius-3xl` | `radius × 2.2` |
| `rounded-4xl` | `--radius-4xl` | `radius × 2.6` |

## CSS Structure in globals.css

The file has four sections in order:

1. **Imports**: Tailwind, tw-animate-css, shadcn/tailwind.css, OpenUI components.css
2. **Custom variant**: `@custom-variant dark (&:is(.dark *))` for dark mode
3. **`:root`** and **`.dark`** blocks: All CSS custom properties
4. **`@theme inline`** block: Bridges CSS vars → Tailwind utility classes (e.g., `--color-primary: var(--primary)`)
5. **`@layer base`**: Global resets (border, outline, body bg/text, font, selection color)

## Dark Mode

- **Mechanism**: `next-themes` with `attribute="class"` — adds `.dark` class to `<html>`
- **Default theme**: `dark`
- **System detection**: Enabled (`enableSystem`)
- **Toggle**: `ThemeToggle` component uses `resolvedTheme` and `setTheme`
- **CSS**: Dark overrides in `.dark { ... }` block, activated via `@custom-variant dark`

## How to Add New Tokens

### Step 1 — Define CSS custom properties

Add to **both** `:root` and `.dark` blocks in `globals.css`:

```css
:root {
  --my-token: oklch(0.5 0.1 200);
  --my-token-foreground: oklch(0.98 0 0);
}

.dark {
  --my-token: oklch(0.7 0.1 200);
  --my-token-foreground: oklch(0.1 0 0);
}
```

### Step 2 — Bridge to Tailwind (if needed as utility class)

Add mapping inside the existing `@theme inline` block:

```css
@theme inline {
  --color-my-token: var(--my-token);
  --color-my-token-foreground: var(--my-token-foreground);
}
```

This enables `bg-my-token`, `text-my-token-foreground`, etc.

### Step 3 — Use in components

```tsx
// As Tailwind classes (preferred)
<div className="bg-my-token text-my-token-foreground" />

// As inline style (rare)
<div style={{ color: "var(--my-token)" }} />
```

## Sidebar Tokens

The sidebar has its own token set that mirrors the base pattern:

- `--sidebar`, `--sidebar-foreground`
- `--sidebar-primary`, `--sidebar-primary-foreground`
- `--sidebar-accent`, `--sidebar-accent-foreground`
- `--sidebar-border`, `--sidebar-ring`

Use `bg-sidebar`, `text-sidebar-foreground`, etc. for sidebar-specific styling.

## Rules

1. **Always use OKLCH** for new color values — match the existing format `oklch(L C H)` or `oklch(L C H / alpha%)`
2. **Always define both light and dark** variants when adding tokens
3. **Bridge to Tailwind** via `@theme inline` if the token will be used as a utility class
4. **Use semantic token names** (e.g., `--success`, `--info`) not raw color names (`--green`, `--blue`)
5. **Follow the foreground pattern** — every background token should have a `-foreground` companion for accessible text
6. **No tailwind.config file** — all theme config lives in `globals.css`
7. **Use Tailwind classes** over inline styles or `var()` references where possible
8. **Keep OKLCH values** perceptually consistent — lightness (L) should be similar across tokens of the same role
9. **Selection color** is hardcoded in `@layer base` using primary blue at 25% opacity
