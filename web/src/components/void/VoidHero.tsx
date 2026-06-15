import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const lineDelays = ["0ms", "80ms", "160ms", "240ms"];

export function VoidHero({
  eyebrow = "DAO OS",
  lines,
  subtitle,
  actions,
  className,
  centered = false,
}: {
  eyebrow?: string;
  lines: string[];
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  centered?: boolean;
}) {
  return (
    <div className={cn("space-y-6", centered && "text-center", className)}>
      <p
        className={cn(
          "font-body text-xs uppercase tracking-[0.08em] text-primary",
          "motion-safe:animate-fade-up motion-safe:[animation-fill-mode:forwards] motion-reduce:opacity-100 opacity-0",
        )}
      >
        {eyebrow}
      </p>
      <div className="space-y-1">
        {lines.map((line, i) => (
          <h1
            key={`${line}-${i}`}
            className={cn(
              "font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-[40px]",
              i > 0 && "text-text-secondary",
              "motion-safe:animate-fade-up motion-safe:[animation-fill-mode:forwards] motion-reduce:opacity-100 opacity-0",
            )}
            style={{ animationDelay: lineDelays[i] ?? `${i * 80}ms` }}
          >
            {line}
          </h1>
        ))}
      </div>
      {subtitle && (
        <p
          className={cn(
            "max-w-xl font-body text-base text-text-secondary md:text-lg",
            centered && "mx-auto",
            "motion-safe:animate-fade-up motion-safe:[animation-fill-mode:forwards] motion-reduce:opacity-100 opacity-0",
          )}
          style={{ animationDelay: "160ms" }}
        >
          {subtitle}
        </p>
      )}
      {actions && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3",
            centered && "justify-center",
            "motion-safe:animate-fade-up motion-safe:[animation-fill-mode:forwards] motion-reduce:opacity-100 opacity-0",
          )}
          style={{ animationDelay: "240ms" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
