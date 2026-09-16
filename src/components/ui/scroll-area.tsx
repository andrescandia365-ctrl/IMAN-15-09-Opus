import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-y-auto overscroll-contain", className)}>{children}</div>
  );
}