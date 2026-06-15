import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function VoidGlass({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("void-glass rounded-[var(--radius-void-card)]", className)} {...props} />
  );
}

export function VoidCard({
  className,
  elevated,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={cn(
        "void-card p-5",
        "motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        elevated && "bg-void-elevated",
        className,
      )}
      {...props}
    />
  );
}

export function VoidCardRow({
  className,
  children,
  trailing,
  status,
}: {
  className?: string;
  children: ReactNode;
  trailing?: ReactNode;
  status?: "green" | "yellow" | "red";
}) {
  const dot =
    status === "green"
      ? "bg-signal-green"
      : status === "yellow"
        ? "bg-signal-yellow"
        : status === "red"
          ? "bg-signal-red"
          : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-void-compact)] border border-void-border",
        "bg-void-surface px-4 py-3 transition-colors duration-150 hover:border-void-border-strong",
        className,
      )}
    >
      {dot && <span className={cn("size-2 shrink-0 rounded-full", dot)} />}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
    </div>
  );
}

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "reused" | "primary";

export function VoidBadge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    neutral: "border-void-border-strong text-text-secondary",
    primary: "border-primary/40 text-primary",
    success: "border-signal-green/40 text-signal-green",
    warning: "border-signal-yellow/40 text-signal-yellow",
    danger: "border-signal-red/40 text-signal-red",
    reused: "border-signal-green/60 text-signal-green font-mono text-[11px] uppercase tracking-wide",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
