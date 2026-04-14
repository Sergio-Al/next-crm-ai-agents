"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 rounded-lg bg-sidebar-accent border border-sidebar-border p-0.5">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          onClick={() => router.replace(pathname, { locale: loc })}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-all uppercase",
            loc === locale
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-sidebar-foreground"
          )}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
