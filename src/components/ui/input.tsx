import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-md bg-elevated px-3.5 text-[15px] text-fg shadow-[var(--shadow-border)] placeholder:text-subtle transition-[box-shadow] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--iman-accent)] disabled:cursor-not-allowed disabled:opacity-50 num",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
