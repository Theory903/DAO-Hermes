import { cn } from "@/lib/utils";

export function SignalOverlay({
  variant,
  onDone,
}: {
  variant: "primary" | "green" | "red";
  onDone?: () => void;
}) {
  const anim =
    variant === "green"
      ? "motion-safe:animate-signal-flash-green"
      : variant === "red"
        ? "motion-safe:animate-signal-flash-red"
        : "motion-safe:animate-signal-flash-primary";

  return (
    <div
      role="presentation"
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-[9999]",
        anim,
        "motion-reduce:hidden",
      )}
      onAnimationEnd={onDone}
    />
  );
}
