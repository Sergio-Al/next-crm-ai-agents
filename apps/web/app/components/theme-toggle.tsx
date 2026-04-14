"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "p-1.5 rounded-lg border transition-colors",
        "border-sidebar-border text-muted-foreground",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        className,
      )}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 hidden dark:block" />
      <Moon className="size-4 block dark:hidden" />
    </button>
  );
}
