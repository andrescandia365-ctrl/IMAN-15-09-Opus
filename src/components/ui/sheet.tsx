import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "bottom",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "bottom" | "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/45 backdrop-blur-md" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-surface text-fg shadow-[var(--shadow-border)] outline-none",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl p-4 pb-[max(16px,env(safe-area-inset-bottom))]",
          side === "right" && "inset-y-0 right-0 h-full w-[min(420px,100vw)] p-5",
          className,
        )}
        {...props}
      >
        {side === "bottom" && (
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 grid size-9 place-items-center rounded-sm text-muted hover:bg-elevated hover:text-fg">
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
