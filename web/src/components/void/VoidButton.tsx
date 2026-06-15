import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-dim focus-visible:ring-primary shadow-[0_0_24px_var(--primary-glow)]",
  secondary:
    "border border-void-border-strong bg-transparent text-text-primary hover:border-primary/40 hover:bg-void-elevated",
  ghost:
    "border border-transparent bg-transparent text-text-secondary hover:border-void-border hover:text-text-primary",
  danger: "bg-signal-red text-white hover:bg-signal-red-dim shadow-[0_0_20px_var(--signal-red-glow)]",
  success: "bg-signal-green text-black hover:bg-signal-green-dim shadow-[0_0_20px_var(--signal-green-glow)]",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-3 text-base",
};

type VoidButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function VoidButton({
  className,
  variant = "primary",
  size = "md",
  ...props
}: VoidButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium",
        "transition-[background-color,border-color,transform,box-shadow] duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-void",
        "active:scale-[0.99] motion-reduce:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
