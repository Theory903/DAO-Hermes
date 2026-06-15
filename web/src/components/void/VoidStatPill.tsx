import { cn } from "@/lib/utils";

export function VoidStatPill({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "void-glass inline-flex items-center gap-2 rounded-full px-4 py-2",
        className,
      )}
    >
      <span className="font-mono text-sm font-medium text-text-primary">{value}</span>
      <span className="font-body text-sm text-text-secondary">{label}</span>
    </div>
  );
}

export function VoidStatRow({
  stats,
  className,
}: {
  stats: Array<{ value: string | number; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {stats.map((s) => (
        <VoidStatPill key={s.label} value={s.value} label={s.label} />
      ))}
    </div>
  );
}
