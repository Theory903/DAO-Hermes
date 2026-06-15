import { cn } from "@/lib/utils";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function VoidFeatureCard({
  icon: Icon,
  title,
  description,
  footer,
  to,
  onClick,
  className,
  staggerIndex,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  footer?: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
  staggerIndex?: number;
}) {
  const inner = (
    <>
      <div className="flex size-10 items-center justify-center rounded-full bg-void-elevated">
        <Icon className="size-8 text-primary" strokeWidth={1.5} />
      </div>
      <h3 className="font-display text-lg font-semibold text-text-primary">{title}</h3>
      <p className="line-clamp-2 font-body text-sm text-text-secondary">{description}</p>
      <div className="mt-auto flex items-center justify-between pt-2">
        {footer}
        <ChevronRight className="size-4 text-text-muted" strokeWidth={1.5} />
      </div>
    </>
  );

  const cardClass = cn(
    "void-card flex min-h-[140px] flex-col gap-3 p-5",
    "motion-safe:animate-fade-up motion-safe:[animation-fill-mode:forwards] motion-reduce:opacity-100",
    (to || onClick) && "cursor-pointer",
    className,
  );

  const style =
    staggerIndex !== undefined
      ? ({ animationDelay: `${staggerIndex * 40}ms` } as React.CSSProperties)
      : undefined;

  const motionClass = "opacity-0 motion-reduce:opacity-100";

  if (to) {
    return (
      <Link to={to} className={cn(cardClass, motionClass)} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <article
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={cn(cardClass, motionClass)}
      style={style}
    >
      {inner}
    </article>
  );
}
