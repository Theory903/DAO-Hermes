import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function VoidPage({
  children,
  glow = false,
  className,
}: {
  children: ReactNode;
  glow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8",
        glow && "void-glow min-h-full",
        className,
      )}
    >
      {children}
    </div>
  );
}
