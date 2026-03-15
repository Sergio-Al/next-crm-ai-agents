import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid auto-rows-[minmax(8rem,auto)] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2 | 3;
}

const colSpanClasses = {
  1: "",
  2: "md:col-span-2",
  3: "lg:col-span-3",
} as const;

const rowSpanClasses = {
  1: "",
  2: "row-span-2",
  3: "row-span-3",
} as const;

export function BentoCard({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/5 bg-neutral-800/30 p-5 text-neutral-200 shadow-sm transition-colors hover:bg-neutral-800/50",
        colSpanClasses[colSpan],
        rowSpanClasses[rowSpan],
        className
      )}
    >
      {children}
    </div>
  );
}
