import { cn } from "@/lib/utils";

export function VoidSectionHeader({
  label,
  title,
  className,
}: {
  label: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="font-body text-xs uppercase tracking-[0.08em] text-text-muted">
        {label}
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
        {title}
      </h2>
    </div>
  );
}
