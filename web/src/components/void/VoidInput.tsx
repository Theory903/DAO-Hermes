import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function VoidInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-full border border-void-border bg-void-surface px-4 py-3",
        "font-body text-sm text-text-primary placeholder:text-text-muted",
        "outline-none transition-colors duration-150",
        "focus:border-primary focus:ring-2 focus:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}

export function VoidTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[var(--radius-void-compact)] border border-void-border bg-void-surface px-4 py-3",
        "font-body text-sm text-text-primary placeholder:text-text-muted",
        "outline-none transition-colors duration-150",
        "focus:border-primary focus:ring-2 focus:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}
