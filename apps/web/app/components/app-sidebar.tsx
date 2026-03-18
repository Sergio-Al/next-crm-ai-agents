"use client";

import {
  LayoutDashboard,
  Users,
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

const navItems = [
  { key: "dashboard" as const, href: "/dashboard" as const, icon: LayoutDashboard },
  { key: "contacts" as const, href: "/contacts" as const, icon: Users },
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
    <aside className="w-64 flex-shrink-0 bg-neutral-900/40 rounded-[2rem] border border-white/5 flex-col p-4 hidden md:flex relative overflow-hidden">
      {/* Subtle top glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="text-white font-medium text-base">C</span>
          </div>
          <span className="font-medium text-base text-neutral-100 tracking-tight">
            {t("brand")}
          </span>
        </Link>
      </div>

      <div className="px-2 mb-2">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-widest">
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
                  ? "text-neutral-100 bg-white/10 shadow-sm border border-white/5"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-white/5 border border-transparent",
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-orange-500 rounded-r-full" />
              )}
              <item.icon
                strokeWidth={1.5}
                className={cn(
                  "size-5 transition-transform",
                  isActive
                    ? "text-orange-400"
                    : "text-neutral-500 group-hover:text-neutral-300 group-hover:scale-110",
                )}
              />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center text-sm font-medium">
            N
          </div>
          <span className="text-sm text-neutral-400">v0.1.0</span>
        </div>
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
