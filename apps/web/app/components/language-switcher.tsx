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
    <div className="flex items-center gap-1 rounded-lg bg-neutral-800/50 border border-white/5 p-0.5">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          onClick={() => router.replace(pathname, { locale: loc })}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-all uppercase",
            loc === locale
              ? "bg-white/10 text-neutral-100 shadow-sm"
              : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
