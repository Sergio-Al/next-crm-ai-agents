"use client";

import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  GitCommitVertical,
  MessageSquare,
  Zap,
  Package,
  ShoppingCart,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { key: "dashboard" as const, href: "/dashboard" as const, icon: LayoutDashboard },
  { key: "contacts" as const, href: "/contacts" as const, icon: Users },
  { key: "accounts" as const, href: "/accounts" as const, icon: Building2 },
  { key: "deals" as const, href: "/deals" as const, icon: Handshake },
  { key: "products" as const, href: "/products" as const, icon: Package },
  { key: "orders" as const, href: "/orders" as const, icon: ShoppingCart },
  { key: "pipeline" as const, href: "/pipeline" as const, icon: GitCommitVertical },
  { key: "chat" as const, href: "/chat" as const, icon: MessageSquare },
  { key: "sessions" as const, href: "/sessions" as const, icon: Zap },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <aside className="w-64 flex-shrink-0 bg-sidebar rounded-[2rem] border border-sidebar-border flex-col p-4 hidden md:flex relative overflow-hidden">
      {/* Subtle top glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-medium text-base">C</span>
          </div>
          <span className="font-medium text-base text-sidebar-foreground tracking-tight">
            {t("brand")}
          </span>
        </Link>
      </div>

      <div className="px-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          {t("navigation")}
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-base transition-all group relative overflow-hidden",
                isActive
                  ? "text-sidebar-foreground bg-sidebar-accent shadow-sm border border-sidebar-border"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 border border-transparent",
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sidebar-primary rounded-r-full" />
              )}
              <item.icon
                strokeWidth={1.5}
                className={cn(
                  "size-5 transition-transform",
                  isActive
                    ? "text-sidebar-primary"
                    : "text-muted-foreground group-hover:text-sidebar-foreground group-hover:scale-110",
                )}
              />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-sidebar-border flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-sm font-medium text-sidebar-foreground">
            N
          </div>
          <span className="text-sm text-muted-foreground">v0.1.0</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  );
}
