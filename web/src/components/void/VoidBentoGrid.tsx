import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function VoidBentoGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
